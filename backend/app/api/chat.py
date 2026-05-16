import json
import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.core.errors import AppError, ErrorCode
from app.schemas.chat import ChatHistoryResponse, ChatMessage, ChatRequest, ChatResponse, ChatSessionsResponse
from app.services.llm_service import LLMService
from app.services.session_service import SessionService

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


def _require_messages(payload: ChatRequest) -> list[ChatMessage]:
    if payload.messages is None:
        raise AppError(
            code=ErrorCode.LLM_BAD_OUTPUT,
            status_code=400,
            message="messages is required for this endpoint",
        )
    return payload.messages


@router.post("", response_model=ChatResponse)
async def create_chat_completion(payload: ChatRequest) -> ChatResponse:
    llm = LLMService()
    _require_llm(llm)
    session = SessionService()
    session_id = payload.session_id
    messages = payload.messages
    user_message: ChatMessage | None = None

    if payload.message is not None:
        if session_id is None:
            session_id = session.create_session(title=payload.message)
        user_message = ChatMessage(role="user", content=payload.message)
        messages = [*session.get_messages(session_id), user_message]

    if messages is None:
        raise AppError(
            code=ErrorCode.LLM_BAD_OUTPUT,
            status_code=400,
            message="messages or message is required",
        )

    try:
        content = await llm.complete(messages)
    except ValueError as exc:
        raise AppError(
            code=ErrorCode.LLM_PROVIDER_ERROR,
            status_code=502,
            message=str(exc),
        ) from exc

    if session_id is not None and user_message is not None:
        session.append_messages(
            session_id,
            [
                (user_message.role, user_message.content),
                ("assistant", content),
            ],
        )

    return ChatResponse(
        content=content,
        model=llm.settings.openai_model,
        mocked=llm.is_mock_mode(),
        session_id=session_id,
    )


@router.get("/sessions", response_model=ChatSessionsResponse)
async def list_chat_sessions() -> ChatSessionsResponse:
    session = SessionService()
    return ChatSessionsResponse(sessions=session.list_sessions())


@router.get("/sessions/{session_id}", response_model=ChatHistoryResponse)
async def get_chat_history(session_id: str) -> ChatHistoryResponse:
    session = SessionService()
    return ChatHistoryResponse(
        session_id=session_id,
        messages=session.get_messages(session_id),
    )


@router.delete("/sessions/{session_id}", response_model=ChatHistoryResponse)
async def clear_chat_history(session_id: str) -> ChatHistoryResponse:
    session = SessionService()
    session.clear_session(session_id)
    return ChatHistoryResponse(session_id=session_id, messages=[])


@router.post("/stream")
async def stream_chat_completion(payload: ChatRequest) -> StreamingResponse:
    llm = LLMService()
    _require_llm(llm)
    messages = _require_messages(payload)

    async def event_stream():
        log.info(
            "chat/stream begin model=%s messages=%d",
            llm.settings.openai_model,
            len(messages),
        )
        yield f"data: {json.dumps({'type': 'meta', 'model': llm.settings.openai_model, 'mocked': llm.is_mock_mode()}, ensure_ascii=False)}\n\n"

        async for token in llm.stream(messages):
            yield f"data: {json.dumps({'type': 'delta', 'content': token}, ensure_ascii=False)}\n\n"

        log.info("chat/stream end")
        yield "data: {\"type\":\"done\"}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/stream-tools")
async def stream_chat_with_tools(payload: ChatRequest) -> StreamingResponse:
    """Day 4：多轮 tool_calls，SSE 中穿插 tool_call / tool_result 与最终 delta。"""

    llm = LLMService()
    messages = _require_messages(payload)

    async def event_stream():
        log.info(
            "chat/stream-tools begin mocked=%s model=%s messages=%d roles=%s",
            llm.is_mock_mode(),
            llm.settings.openai_model,
            len(messages),
            [m.role for m in messages],
        )
        yield f"data: {json.dumps({'type': 'meta', 'model': llm.settings.openai_model, 'mocked': llm.is_mock_mode()}, ensure_ascii=False)}\n\n"

        async for event in llm.stream_with_tools(messages):
            ev_type = event.get("type")
            log.debug("chat/stream-tools yield type=%s keys=%s", ev_type, list(event.keys()))
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

        log.info("chat/stream-tools end")
        yield "data: {\"type\":\"done\"}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
