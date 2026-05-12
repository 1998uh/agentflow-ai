import asyncio
import re
from collections.abc import AsyncIterator

from openai import APIError, AsyncOpenAI
from pydantic import ValidationError

from app.core.config import get_settings
from app.schemas.chat import ChatMessage
from app.schemas.requirements import RequirementsAnalysis

_REQUIREMENTS_SYSTEM = """你是 AgentFlow AI 平台的企业级需求分析师。
你必须只输出一个合法的 JSON 对象（不要使用 markdown 代码围栏、不要在 JSON 前后添加任何说明文字），以便服务端直接解析。
JSON 必须包含以下键（键名固定为英文，值为中文业务表述）：
- "summary": 字符串，2～4 句的需求摘要。
- "user_stories": 字符串数组，至少 2 条，采用「作为…我希望…以便…」句式。
- "acceptance_criteria": 字符串数组，至少 2 条可测试、可验收的条件。
- "risks": 字符串数组，列出风险、依赖与待澄清点；若无则输出空数组 []。
"""


class LLMService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.client = self._build_client()

    def is_mock_mode(self) -> bool:
        return self.client is None

    async def complete(self, messages: list[ChatMessage]) -> str:
        if self.is_mock_mode():
            return self._mock_answer(messages)

        client = self._provider_client()
        try:
            response = await client.chat.completions.create(
                model=self.settings.openai_model,
                messages=self._to_provider_messages(messages),
            )
        except APIError as exc:
            return self._provider_error_message(exc)

        if isinstance(response, str):
            return self._unexpected_provider_response_message(response)

        message = response.choices[0].message
        return message.content or getattr(message, "reasoning_content", "") or ""

    async def analyze_requirements(self, description: str) -> tuple[RequirementsAnalysis, bool]:
        if self.is_mock_mode():
            return self._mock_requirements_analysis(description), True

        client = self._provider_client()
        messages = self._requirements_messages(description)
        print(messages)
        raw = await self._complete_as_json_object(client, messages)
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
            raw_retry = await self._complete_as_json_object(client, repair_messages)
            try:
                return self._parse_requirements_json(raw_retry), False
            except ValidationError as second_error:
                raise ValueError(
                    "模型两次输出均未通过结构化校验，请换模型或简化需求描述后重试。"
                    f" 末次错误：{second_error!s}"
                ) from second_error

    async def stream(self, messages: list[ChatMessage]) -> AsyncIterator[str]:
        if self.is_mock_mode():
            content = await self.complete(messages)
            for token in self._chunk_text(content):
                await asyncio.sleep(0.04)
                yield token
            return

        client = self._provider_client()
        try:
            stream = await client.chat.completions.create(
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

        async for chunk in stream:
            if not chunk.choices:
                continue

            delta_obj = chunk.choices[0].delta
            delta = delta_obj.content or getattr(delta_obj, "reasoning_content", "")
            if delta:
                yield delta

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

    async def _complete_as_json_object(
        self,
        client: AsyncOpenAI,
        messages: list[dict[str, str]],
    ) -> str:
        try:
            response = await client.chat.completions.create(
                model=self.settings.openai_model,
                messages=messages,
                response_format={"type": "json_object"},
            )
        except APIError as exc:
            status = getattr(exc, "status_code", None)
            if status in (400, 422):
                try:
                    response = await client.chat.completions.create(
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
