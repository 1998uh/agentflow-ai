from typing import Literal

from pydantic import BaseModel, Field


Role = Literal["user", "assistant", "system"]


class ChatMessage(BaseModel):
    role: Role
    content: str = Field(min_length=1)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)


class ChatResponse(BaseModel):
    content: str
    model: str
    mocked: bool = False

