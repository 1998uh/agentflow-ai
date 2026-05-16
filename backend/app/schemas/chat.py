from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field, model_validator


Role = Literal["user", "assistant", "system"]


class ChatMessage(BaseModel):
    role: Role
    content: str = Field(min_length=1)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] | None = Field(default=None, min_length=1)
    session_id: str | None = None
    message: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def require_messages_or_message(self) -> "ChatRequest":
        if self.messages is None and self.message is None:
            raise ValueError("messages or message is required")
        return self


class ChatResponse(BaseModel):
    content: str
    model: str
    mocked: bool = False
    session_id: str | None = None


class ChatSession(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex)
    title: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    message_count: int = 0


class ChatHistoryResponse(BaseModel):
    session_id: str
    messages: list[ChatMessage]


class ChatSessionsResponse(BaseModel):
    sessions: list[ChatSession]

