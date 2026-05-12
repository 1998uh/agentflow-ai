import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.schemas.chat import ChatRequest, ChatResponse
from app.services.llm_service import LLMService

router = APIRouter(prefix="/chat", tags=["chat"])


def _require_llm(llm: LLMService) -> None:
    if llm.is_mock_mode():
        raise HTTPException(
            status_code=503,
            detail=(
                "未配置 OPENAI_API_KEY，无法调用真实模型。"
                "请在 backend/.env 中设置（可参考 .env.example）。"
            ),
        )


@router.post("", response_model=ChatResponse)
async def create_chat_completion(payload: ChatRequest) -> ChatResponse:
    llm = LLMService()
    _require_llm(llm)
    content = await llm.complete(payload.messages)

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
        yield f"data: {json.dumps({'type': 'meta', 'model': llm.settings.openai_model, 'mocked': llm.is_mock_mode()}, ensure_ascii=False)}\n\n"

        async for token in llm.stream(payload.messages):
            yield f"data: {json.dumps({'type': 'delta', 'content': token}, ensure_ascii=False)}\n\n"

        yield "data: {\"type\":\"done\"}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")

