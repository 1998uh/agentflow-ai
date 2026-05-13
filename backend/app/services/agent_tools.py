"""Day 4：本地工具实现与 OpenAI Tool schema 定义。"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

log = logging.getLogger(__name__)

# 模拟「项目内文档」切片，后续 RAG 周可替换为真实检索
_DOC_CHUNKS: list[tuple[str, str]] = [
    (
        "architecture",
        "AgentFlow AI 采用 Next.js 前端与 FastAPI 后端，SSE 透出模型流式输出；"
        "模型层抽象为 LLMService，便于替换供应商。",
    ),
    (
        "sse",
        "聊天接口使用 text/event-stream；每条事件为 JSON，含 type：meta、delta、tool_call、tool_result、done。",
    ),
    (
        "day4",
        "Tool Calling：模型在 assistant 消息中返回 tool_calls，服务器执行工具并以 role=tool 写回结果，再请求模型生成最终回复。",
    ),
]

_MAX_TOOL_RESULT_CHARS = 6000

OPENAI_TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_project_docs",
            "description": "在 AgentFlow AI 项目内置说明文档中按关键词检索相关片段，用于回答架构、协议、实现细节问题。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "检索关键词或短语，中文即可。",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_task_plan",
            "description": "根据目标描述生成分阶段研发任务计划（标题、任务项、可选验收提示）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "goal": {
                        "type": "string",
                        "description": "要解决的业务或技术目标。",
                    },
                    "phases": {
                        "type": "integer",
                        "description": "划分为几个阶段，默认 3，范围 2～5。",
                        "minimum": 2,
                        "maximum": 5,
                    },
                },
                "required": ["goal"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_api_mock",
            "description": "生成一段 FastAPI 路由草稿代码（字符串），用于接口讨论或原型。",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "URL 路径，例如 /api/chat/stream-tools。",
                    },
                    "method": {
                        "type": "string",
                        "description": "HTTP 方法，如 post、get。",
                        "enum": ["get", "post", "put", "patch", "delete"],
                    },
                    "summary": {
                        "type": "string",
                        "description": "接口用途一句话说明。",
                    },
                },
                "required": ["path", "method"],
            },
        },
    },
]


def search_project_docs(query: str) -> str:
    # 这里的 strip() 是去除字符串两端的空白字符（包括空格、换行等）
    q = query.strip()
    if not q:
        return "（未提供 query）"

    ql = q.lower()
    seen: set[str] = set()
    hits: list[str] = []

    # tag, body 会分别返回 _DOC_CHUNKS 中每个文档切片的标签和正文内容
    for tag, body in _DOC_CHUNKS:
        bl = body.lower()
        key = f"{tag}:{body}"
        if ql in bl:
            if key not in seen:
                seen.add(key)
                hits.append(f"[{tag}] {body}")
            continue
        for part in re.findall(r"[\u4e00-\u9fff]{2,}|[a-zA-Z]{2,}", q):
            if part.lower() in bl:
                if key not in seen:
                    seen.add(key)
                    hits.append(f"[{tag}] {body}")
                break

    if not hits:
        return (
            f"未在本地文档切片中找到与「{query}」强匹配的段落。"
            "可换个关键词或稍后在知识库 RAG 中检索。"
        )

    return "\n\n".join(hits[:5])


def create_task_plan(goal: str, phases: int | None = None) -> str:
    n = 3 if phases is None else max(2, min(5, phases))
    lines = [f"目标：{goal.strip()}", "", "分阶段计划："]
    for i in range(n):
        lines.append(
            f"{i + 1}. 阶段 {i + 1}：拆解交付物、估时、依赖项；"
            f"验收：本阶段产出可演示或可测试。"
        )
    lines.append("")
    lines.append("风险：范围蔓延、模型输出不稳定；应对：结构化输出校验与工具白名单。")
    return "\n".join(lines)


def generate_api_mock(path: str, method: str, summary: str | None = None) -> str:
    p = path.strip() or "/api/example"
    m = method.strip().lower() or "post"
    desc = (summary or "（由模型补充说明）").strip()
    return f'''@router.{m}("{p}")
async def handler(payload: dict) -> dict:
    """{desc}"""
    return {{"ok": True, "echo": payload}}
'''


_TOOL_DISPATCH: dict[str, Any] = {
    "search_project_docs": search_project_docs,
    "create_task_plan": create_task_plan,
    "generate_api_mock": generate_api_mock,
}


def _preview(text: str, limit: int = 120) -> str:
    s = text.replace("\n", " ").strip()
    if len(s) <= limit:
        return s
    return f"{s[:limit]}…"


def run_tool(name: str, arguments: dict[str, Any]) -> tuple[str, bool]:
    if name not in _TOOL_DISPATCH:
        log.warning("run_tool unknown tool name=%s", name)
        return f"未知工具：{name}", False

    log.debug("run_tool start name=%s arg_keys=%s", name, list(arguments.keys()))

    fn = _TOOL_DISPATCH[name]
    try:
        if name == "search_project_docs":
            raw = fn(arguments.get("query", ""))
        elif name == "create_task_plan":
            raw = fn(arguments.get("goal", ""), arguments.get("phases"))
        elif name == "generate_api_mock":
            raw = fn(
                arguments.get("path", "/api/example"),
                arguments.get("method", "post"),
                arguments.get("summary"),
            )
        else:
            log.error("run_tool dispatch missing branch name=%s", name)
            return "内部错误：工具未绑定实现", False
    except Exception as exc:  # noqa: BLE001 — 工具执行错误反馈给模型
        log.warning("run_tool exception name=%s: %s", name, exc)
        return f"工具执行异常：{exc!s}", False

    raw = raw.strip()
    if len(raw) > _MAX_TOOL_RESULT_CHARS:
        raw = raw[: _MAX_TOOL_RESULT_CHARS] + "\n…（结果被截断）"
    log.info(
        "run_tool done name=%s ok=True result_len=%d preview=%s",
        name,
        len(raw),
        _preview(raw, 100),
    )
    return raw, True


def parse_tool_arguments(arguments: str | None) -> dict[str, Any]:
    if not arguments or not arguments.strip():
        return {}
    try:
        return json.loads(arguments)
    except json.JSONDecodeError as exc:
        raise ValueError(f"工具参数 JSON 无效：{exc}") from exc
