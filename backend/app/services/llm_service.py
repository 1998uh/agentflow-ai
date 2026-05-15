import asyncio
import json
import logging
from collections.abc import AsyncIterator
from typing import Any

from openai import APIConnectionError, APIError, APIStatusError, APITimeoutError, AsyncOpenAI
from pydantic import ValidationError

from app.core.config import get_settings
from app.schemas.chat import ChatMessage
from app.schemas.requirements import RequirementsAnalysis
from app.services.agent_tools import (
    OPENAI_TOOL_DEFINITIONS,
    parse_tool_arguments,
    run_tool,
)

log = logging.getLogger(__name__)

_MAX_TOOL_ROUNDS = 6
_RETRYABLE_STATUS_CODES = {408, 409, 429, 500, 502, 503, 504}

_TOOLS_SYSTEM = """你是 AgentFlow AI 的研发助手，可使用工具完成事实检索与可执行产物草稿。
规则：
- 需要查项目内文档时调用 search_project_docs。
- 需要排期/里程碑式任务拆解时调用 create_task_plan。
- 需要接口草稿代码时调用 generate_api_mock。
- 工具返回后，用简洁中文综合回答用户，并引用工具结果要点。"""

_REQUIREMENTS_SYSTEM = """你是 AgentFlow AI 平台的企业级需求分析师。
你必须只输出一个合法的 JSON 对象（不要使用 markdown 代码围栏、不要在 JSON 前后添加任何说明文字），以便服务端直接解析。
JSON 必须包含以下键（键名固定为英文，值为中文业务表述）：
- "summary": 字符串，2～4 句的需求摘要。
- "user_stories": 字符串数组，至少 2 条，采用「作为…我希望…以便…」句式。
- "acceptance_criteria": 字符串数组，至少 2 条可测试、可验收的条件。
- "risks": 字符串数组，列出风险、依赖与待澄清点；若无则输出空数组 []。
"""


def _log_preview(text: str, limit: int = 160) -> str:
    s = text.replace("\n", " ").strip()
    if len(s) <= limit:
        return s
    return f"{s[:limit]}…"


class LLMService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.client = self._build_client()

    def is_mock_mode(self) -> bool:
        return self.client is None

    async def complete(self, messages: list[ChatMessage]) -> str:
        if self.is_mock_mode():
            return self._mock_answer(messages)

        try:
            response = await self._create_chat_completion(
                "chat.complete",
                model=self.settings.openai_model,
                messages=self._to_provider_messages(messages),
            )
        except APIError as exc:
            raise ValueError(self._provider_error_message(exc)) from exc

        if isinstance(response, str):
            raise ValueError(self._unexpected_provider_response_message(response))

        message = response.choices[0].message
        return message.content or getattr(message, "reasoning_content", "") or ""

    async def analyze_requirements(self, description: str) -> tuple[RequirementsAnalysis, bool]:
        if self.is_mock_mode():
            return self._mock_requirements_analysis(description), True

        messages = self._requirements_messages(description)
        log.debug("analyze_requirements messages=%s", messages)
        raw = await self._complete_as_json_object(messages)
        try:
            return self._parse_requirements_json(raw), False
        except ValidationError as first_error:
            repair_messages = [
                *messages,
                {"role": "assistant", "content": raw},
                {
                    "role": "user",
                    "content": (
                        "上次输出无法通过服务端校验。错误："
                        f"{str(first_error)}\n"
                        "请重新输出「唯一一个」完整 JSON 对象，键名必须为 "
                        "summary、user_stories、acceptance_criteria、risks。"
                    ),
                },
            ]
            raw_retry = await self._complete_as_json_object(repair_messages)
            try:
                return self._parse_requirements_json(raw_retry), False
            except ValidationError as second_error:
                raise ValueError(
                    "模型两次输出均未通过结构化校验，请换模型或简化需求描述后重试。"
                    f" 末次错误：{second_error!s}"
                ) from second_error

    async def stream_with_tools(self, messages: list[ChatMessage]) -> AsyncIterator[dict[str, Any]]:
        log.info(
            "stream_with_tools start mock=%s client_messages=%d roles=%s",
            self.is_mock_mode(),
            len(messages),
            [m.role for m in messages],
        )
        if self.is_mock_mode():
            async for event in self._mock_stream_with_tools(messages):
                log.debug("stream_with_tools(mock) yield type=%s", event.get("type"))
                yield event
            log.info("stream_with_tools(mock) done")
            return

        api_messages: list[dict[str, Any]] = self._messages_with_tools_system(messages)
        log.debug(
            "stream_with_tools provider_messages=%d roles=%s",
            len(api_messages),
            [m.get("role") for m in api_messages],
        )

        for round_index in range(_MAX_TOOL_ROUNDS):
            log.info(
                "stream_with_tools round=%d/%d api_messages=%d",
                round_index + 1,
                _MAX_TOOL_ROUNDS,
                len(api_messages),
            )
            try:
                response = await self._create_chat_completion(
                    "chat.stream_tools",
                    model=self.settings.openai_model,
                    messages=api_messages,
                    tools=OPENAI_TOOL_DEFINITIONS,
                    tool_choice="auto",
                )
            except APIError as exc:
                log.warning("stream_with_tools provider APIError: %s", exc)
                yield {"type": "delta", "content": self._provider_error_message(exc)}
                return

            if isinstance(response, str):
                log.warning("stream_with_tools unexpected str response preview=%s", _log_preview(response))
                yield {"type": "delta", "content": self._unexpected_provider_response_message(response)}
                return

            choice = response.choices[0].message
            tool_calls = choice.tool_calls

            if tool_calls:
                names = [tc.function.name for tc in tool_calls]
                log.info(
                    "stream_with_tools model returned tool_calls count=%d names=%s",
                    len(tool_calls),
                    names,
                )
                log.debug(
                    "stream_with_tools tool raw_arguments=%s",
                    [(tc.id, tc.function.name, _log_preview(tc.function.arguments or "", 200)) for tc in tool_calls],
                )
                assistant_payload: dict[str, Any] = {
                    "role": "assistant",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                        for tc in tool_calls
                    ],
                }
                if choice.content:
                    assistant_payload["content"] = choice.content
                api_messages.append(assistant_payload)

                for tc in tool_calls:
                    name = tc.function.name
                    raw_args = tc.function.arguments or "{}"
                    try:
                        args_preview = json.loads(raw_args)
                    except json.JSONDecodeError:
                        args_preview = {"_raw": raw_args}

                    yield {
                        "type": "tool_call",
                        "tool_call_id": tc.id,
                        "name": name,
                        "arguments": args_preview,
                    }

                    try:
                        args = parse_tool_arguments(tc.function.arguments)
                        result, ok = run_tool(name, args)
                    except ValueError as exc:
                        result, ok = str(exc), False
                        log.warning("stream_with_tools tool args parse failed name=%s err=%s", name, exc)

                    yield {
                        "type": "tool_result",
                        "tool_call_id": tc.id,
                        "name": name,
                        "content": result,
                        "ok": ok,
                    }
                    api_messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc.id,
                            "content": result,
                        }
                    )
                continue

            text = (choice.content or "").strip()
            if not text:
                text = "（模型未返回可展示的文本。）"
            log.info(
                "stream_with_tools final assistant text len=%d preview=%s",
                len(text),
                _log_preview(text, 180),
            )
            for token in self._chunk_text(text, size=10):
                yield {"type": "delta", "content": token}
                await asyncio.sleep(0.02)
            log.info("stream_with_tools done after final text")
            return

        log.warning("stream_with_tools stopped: max_rounds=%d exceeded", _MAX_TOOL_ROUNDS)
        overflow = "工具调用轮数达到上限，已停止。请拆分问题或重试。"
        for token in self._chunk_text(overflow):
            yield {"type": "delta", "content": token}
            await asyncio.sleep(0.02)

    async def stream(self, messages: list[ChatMessage]) -> AsyncIterator[str]:
        log.info(
            "stream(chat) begin mock=%s messages=%d",
            self.is_mock_mode(),
            len(messages),
        )
        if self.is_mock_mode():
            content = await self.complete(messages)
            for token in self._chunk_text(content):
                await asyncio.sleep(0.04)
                yield token
            return

        try:
            stream = await self._create_chat_completion(
                "chat.stream",
                model=self.settings.openai_model,
                messages=self._to_provider_messages(messages),
                stream=True,
            )
        except APIError as exc:
            yield self._provider_error_message(exc)
            return

        if isinstance(stream, str):
            yield self._unexpected_provider_response_message(stream)
            return

        try:
            async for chunk in stream:
                if not chunk.choices:
                    continue

                delta_obj = chunk.choices[0].delta
                delta = delta_obj.content or getattr(delta_obj, "reasoning_content", "")
                if delta:
                    yield delta
        except (APITimeoutError, APIConnectionError, APIStatusError, APIError) as exc:
            yield self._provider_error_message(exc)

    def _mock_answer(self, messages: list[ChatMessage]) -> str:
        latest_user_message = next(
            (message.content for message in reversed(messages) if message.role == "user"),
            "",
        )

        return (
            "I am AgentFlow AI's local mock model. Add OPENAI_API_KEY in backend/.env "
            "to call the configured OpenAI-compatible provider."
            f"\n\nYou said: {latest_user_message}"
        )

    def _chunk_text(self, text: str, size: int = 8) -> list[str]:
        return [text[index : index + size] for index in range(0, len(text), size)]

    def _build_client(self) -> AsyncOpenAI | None:
        if not self.settings.openai_api_key:
            return None

        return AsyncOpenAI(
            api_key=self.settings.openai_api_key,
            base_url=self._openai_client_base_url(),
            timeout=self.settings.llm_request_timeout_seconds,
            max_retries=0,
        )

    def _provider_client(self) -> AsyncOpenAI:
        if self.client is None:
            raise RuntimeError("OPENAI_API_KEY is required for provider mode.")

        return self.client

    def _to_provider_messages(self, messages: list[ChatMessage]) -> list[dict[str, str]]:
        return [
            {
                "role": message.role,
                "content": message.content,
            }
            for message in messages
        ]

    def _messages_with_tools_system(self, messages: list[ChatMessage]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        if not messages or messages[0].role != "system":
            out.append({"role": "system", "content": _TOOLS_SYSTEM})
        for message in messages:
            out.append({"role": message.role, "content": message.content})
        return out

    async def _mock_stream_with_tools(self, messages: list[ChatMessage]) -> AsyncIterator[dict[str, Any]]:
        latest_user = next(
            (m.content for m in reversed(messages) if m.role == "user"),
            "",
        )
        plans: list[tuple[str, dict[str, Any]]] = []
        u = latest_user

        if any(k in u for k in ("文档", "检索", "知识", "架构", "SSE", "sse", "Tool", "tool")):
            plans.append(("search_project_docs", {"query": "AgentFlow 工具调用 SSE"}))

        if any(k in u for k in ("计划", "排期", "拆解", "里程碑", "任务")):
            plans.append(
                (
                    "create_task_plan",
                    {
                        "goal": (u.strip()[:200] or "完成 Day4 Tool Calling 演示"),
                        "phases": 3,
                    },
                )
            )

        if (
            any(x in u for x in ("API", "接口", "路由", "FastAPI", "fastapi"))
            or "api" in u.lower()
        ):
            plans.append(
                (
                    "generate_api_mock",
                    {
                        "path": "/api/chat/stream-tools",
                        "method": "post",
                        "summary": "SSE 流式返回工具事件与模型增量",
                    },
                )
            )

        if not plans:
            plans.append(("search_project_docs", {"query": u.strip()[:80] or "agentflow"}))

        log.info(
            "mock_stream_with_tools user_preview=%s planned_tools=%s",
            _log_preview(u, 100),
            [p[0] for p in plans[:3]],
        )

        for index, (name, args) in enumerate(plans[:3], start=1):
            call_id = f"mock_tool_{index}"
            yield {"type": "tool_call", "tool_call_id": call_id, "name": name, "arguments": args}
            await asyncio.sleep(0.06)
            result, ok = run_tool(name, args)
            yield {"type": "tool_result", "tool_call_id": call_id, "name": name, "content": result, "ok": ok}
            await asyncio.sleep(0.04)

        summary = (
            "（mock）以上是本地模拟的工具管道。"
            f"已执行：{'、'.join(p[0] for p in plans[:3])}。"
            "在 backend/.env 配置 OPENAI_API_KEY 后，由真实模型在多轮对话中决定要调用哪些工具。"
        )
        for token in self._chunk_text(summary, size=12):
            yield {"type": "delta", "content": token}
            await asyncio.sleep(0.03)

    def _openai_client_base_url(self) -> str:
        base_url = self.settings.openai_base_url.rstrip("/")
        if "api.deepseek.com" in base_url:
            return base_url

        if base_url.endswith("/v1"):
            return base_url

        return f"{base_url}/v1"

    def _provider_error_message(self, exc: APIError) -> str:
        status_code = getattr(exc, "status_code", None)
        return (
            "Provider request failed"
            f"{f' with status {status_code}' if status_code else ''}: {exc.message}"
        )

    def _unexpected_provider_response_message(self, response: str) -> str:
        preview = response.strip().replace("\n", " ")[:160]
        return (
            "Provider returned a non-JSON response. Check OPENAI_BASE_URL; "
            f"response preview: {preview}"
        )

    async def _create_chat_completion(self, operation: str, **kwargs: Any) -> Any:
        max_attempts = max(1, self.settings.llm_max_retries + 1)
        for attempt_index in range(max_attempts):
            try:
                return await self._provider_client().chat.completions.create(**kwargs)
            except (APITimeoutError, APIConnectionError, APIStatusError, APIError) as exc:
                attempt_number = attempt_index + 1
                should_retry = self._is_retryable_provider_error(exc)
                if not should_retry or attempt_number >= max_attempts:
                    log.warning(
                        "provider call failed operation=%s attempt=%d/%d retryable=%s err=%s",
                        operation,
                        attempt_number,
                        max_attempts,
                        should_retry,
                        self._provider_error_message(exc),
                    )
                    raise

                delay = self._retry_delay_seconds(attempt_index)
                log.warning(
                    "provider call retrying operation=%s attempt=%d/%d delay=%.2fs err=%s",
                    operation,
                    attempt_number,
                    max_attempts,
                    delay,
                    self._provider_error_message(exc),
                )
                await asyncio.sleep(delay)

        raise RuntimeError("unreachable provider retry state")

    def _is_retryable_provider_error(self, exc: APIError) -> bool:
        if isinstance(exc, (APITimeoutError, APIConnectionError)):
            return True
        status_code = getattr(exc, "status_code", None)
        if status_code is None:
            return True
        return status_code in _RETRYABLE_STATUS_CODES

    def _retry_delay_seconds(self, attempt_index: int) -> float:
        base_delay = max(0.0, self.settings.llm_retry_backoff_seconds)
        return base_delay * (2**attempt_index)

    async def _complete_as_json_object(
        self,
        messages: list[dict[str, str]],
    ) -> str:
        try:
            response = await self._create_chat_completion(
                "requirements.json",
                model=self.settings.openai_model,
                messages=messages,
                response_format={"type": "json_object"},
            )
        except APIError as exc:
            status = getattr(exc, "status_code", None)
            if status in (400, 422):
                try:
                    response = await self._create_chat_completion(
                        "requirements.text_fallback",
                        model=self.settings.openai_model,
                        messages=messages,
                    )
                except APIError as inner_exc:
                    raise ValueError(self._provider_error_message(inner_exc)) from inner_exc
            else:
                raise ValueError(self._provider_error_message(exc)) from exc

        if isinstance(response, str):
            raise ValueError(self._unexpected_provider_response_message(response))

        message = response.choices[0].message
        content = message.content or getattr(message, "reasoning_content", "") or ""
        if not content.strip():
            raise ValueError("模型返回空内容，无法解析为 JSON。")

        return content

    def _requirements_messages(self, description: str) -> list[dict[str, str]]:
        return [
            {"role": "system", "content": _REQUIREMENTS_SYSTEM},
            {
                "role": "user",
                "content": f"请根据以下需求描述输出符合约定的 JSON：\n\n{description.strip()}",
            },
        ]

    def _extract_json_text(self, raw: str) -> str:
        text = raw.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()
        if not text.startswith("{"):
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1 and end > start:
                text = text[start : end + 1]
        return text.strip()

    def _parse_requirements_json(self, raw: str) -> RequirementsAnalysis:
        text = self._extract_json_text(raw)
        return RequirementsAnalysis.model_validate_json(text)

    def _mock_requirements_analysis(self, description: str) -> RequirementsAnalysis:
        snippet = (description.strip()[:240] or "（空需求）").replace("\n", " ")
        return RequirementsAnalysis(
            summary=(
                "本地 mock：已收到需求描述片段。"
                f"「{snippet}{'…' if len(description.strip()) > 240 else ''}」。"
                "在 backend/.env 配置 OPENAI_API_KEY 后，将由真实模型生成分析。"
            ),
            user_stories=[
                "作为产品经理，我希望把上述需求拆成可交付的用户故事，以便研发排期与验收对齐。",
                "作为终端用户，我希望核心流程稳定可用，以便在关键场景下顺利完成目标。",
            ],
            acceptance_criteria=[
                "需求摘要、用户故事、验收标准、风险点四类信息齐全且语义自洽。",
                "在无 API Key 时接口仍返回可通过 Pydantic 校验的结构化占位数据。",
            ],
            risks=[
                "当前为占位分析，不代表对真实业务或合规性的评估。",
                "未接供应商时无法验证模型在复杂需求上的稳定性。",
            ],
        )
