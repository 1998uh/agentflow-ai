import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.schemas.chat import ChatRequest, ChatResponse
from app.services.llm_service import LLMService

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def create_chat_completion(payload: ChatRequest) -> ChatResponse:
    llm = LLMService()
    content = await llm.complete(payload.messages)

    return ChatResponse(
        content=content,
        model=llm.settings.openai_model,
        mocked=llm.is_mock_mode(),
    )


@router.post("/stream")
async def stream_chat_completion(payload: ChatRequest) -> StreamingResponse:
    llm = LLMService()

    async def event_stream():
        async for token in llm.stream(payload.messages):
            yield f"data: {json.dumps({'type': 'delta', 'content': token}, ensure_ascii=False)}\n\n"

        yield "data: {\"type\":\"done\"}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")

