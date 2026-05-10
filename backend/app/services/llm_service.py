import asyncio
from collections.abc import AsyncIterator

from app.core.config import get_settings
from app.schemas.chat import ChatMessage


class LLMService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def is_mock_mode(self) -> bool:
        return not self.settings.openai_api_key

    async def complete(self, messages: list[ChatMessage]) -> str:
        if self.is_mock_mode():
            return self._mock_answer(messages)

        # Day 1 keeps the provider boundary explicit. Tomorrow we can add the
        # official OpenAI client here without changing FastAPI or the frontend.
        return self._mock_answer(messages)

    async def stream(self, messages: list[ChatMessage]) -> AsyncIterator[str]:
        content = await self.complete(messages)
        for token in self._chunk_text(content):
            await asyncio.sleep(0.04)
            yield token

    def _mock_answer(self, messages: list[ChatMessage]) -> str:
        latest_user_message = next(
            (message.content for message in reversed(messages) if message.role == "user"),
            "",
        )

        return (
            "我是 AgentFlow AI 的本地模拟模型。今天我们先跑通 AI 应用最小闭环："
            "Next.js 前端发送消息，FastAPI 后端接收请求，并通过 SSE 流式返回。"
            f"\n\n你刚才说：{latest_user_message}"
            "\n\n明天我们会把这里替换成真实模型 API，并加入结构化输出。"
        )

    def _chunk_text(self, text: str, size: int = 8) -> list[str]:
        return [text[index : index + size] for index in range(0, len(text), size)]

