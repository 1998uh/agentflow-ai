import json
import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.core.errors import AppError, ErrorCode
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.llm_service import LLMService

router = APIRouter(prefix="/chat", tags=["chat"])
log = logging.getLogger(__name__)


def _require_llm(llm: LLMService) -> None:
    if llm.is_mock_mode():
        raise AppError(
            code=ErrorCode.LLM_CONFIG_MISSING,
            status_code=503,
            message=(
                "未配置 OPENAI_API_KEY，无法调用真实模型。"
                "请在 backend/.env 中设置（可参考 .env.example）。"
            ),
        )


@router.post("", response_model=ChatResponse)
async def create_chat_completion(payload: ChatRequest) -> ChatResponse:
    llm = LLMService()
    _require_llm(llm)
    try:
        content = await llm.complete(payload.messages)
    except ValueError as exc:
        raise AppError(
            code=ErrorCode.LLM_PROVIDER_ERROR,
            status_code=502,
            message=str(exc),
        ) from exc

    return ChatResponse(
        content=content,
        model=llm.settings.openai_model,
        mocked=llm.is_mock_mode(),
    )


@router.post("/stream")
async def stream_chat_completion(payload: ChatRequest) -> StreamingResponse:
    llm = LLMService()
    _require_llm(llm)

    async def event_stream():
        log.info(
            "chat/stream begin model=%s messages=%d",
            llm.settings.openai_model,
            len(payload.messages),
        )
        yield f"data: {json.dumps({'type': 'meta', 'model': llm.settings.openai_model, 'mocked': llm.is_mock_mode()}, ensure_ascii=False)}\n\n"

        async for token in llm.stream(payload.messages):
            yield f"data: {json.dumps({'type': 'delta', 'content': token}, ensure_ascii=False)}\n\n"

        log.info("chat/stream end")
        yield "data: {\"type\":\"done\"}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/stream-tools")
async def stream_chat_with_tools(payload: ChatRequest) -> StreamingResponse:
    """Day 4：多轮 tool_calls，SSE 中穿插 tool_call / tool_result 与最终 delta。"""

    llm = LLMService()

    async def event_stream():
        log.info(
            "chat/stream-tools begin mocked=%s model=%s messages=%d roles=%s",
            llm.is_mock_mode(),
            llm.settings.openai_model,
            len(payload.messages),
            [m.role for m in payload.messages],
        )
        yield f"data: {json.dumps({'type': 'meta', 'model': llm.settings.openai_model, 'mocked': llm.is_mock_mode()}, ensure_ascii=False)}\n\n"

        async for event in llm.stream_with_tools(payload.messages):
            ev_type = event.get("type")
            log.debug("chat/stream-tools yield type=%s keys=%s", ev_type, list(event.keys()))
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

        log.info("chat/stream-tools end")
        yield "data: {\"type\":\"done\"}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")

