from enum import StrEnum
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel


class ErrorCode(StrEnum):
    LLM_CONFIG_MISSING = "LLM_CONFIG_MISSING"
    LLM_BAD_OUTPUT = "LLM_BAD_OUTPUT"
    LLM_PROVIDER_ERROR = "LLM_PROVIDER_ERROR"
    LLM_UNEXPECTED_RESPONSE = "LLM_UNEXPECTED_RESPONSE"


class ErrorBody(BaseModel):
    code: ErrorCode | str
    message: str
    request_id: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


class AppError(Exception):
    def __init__(
        self,
        *,
        code: ErrorCode,
        message: str,
        status_code: int = 500,
        extra: dict[str, Any] | None = None,
    ) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        self.extra = extra or {}
        super().__init__(message)


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    payload = ErrorResponse(
        error=ErrorBody(
            code=exc.code,
            message=exc.message,
            request_id=request_id,
        )
    )
    return JSONResponse(status_code=exc.status_code, content=payload.model_dump(mode="json"))
