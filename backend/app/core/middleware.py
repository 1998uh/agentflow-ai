import logging
import time
import uuid

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

log = logging.getLogger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = _get_request_id(scope)
        scope.setdefault("state", {})["request_id"] = request_id

        method = scope.get("method", "-")
        path = scope.get("path", "-")
        started_at = time.perf_counter()
        status_code: int | None = None

        async def send_with_request_id(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                headers = MutableHeaders(scope=message)
                headers.append(REQUEST_ID_HEADER, request_id)
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        except Exception:
            duration_ms = _elapsed_ms(started_at)
            log.exception(
                "request_id=%s method=%s path=%s failed duration_ms=%.2f",
                request_id,
                method,
                path,
                duration_ms,
            )
            raise

        duration_ms = _elapsed_ms(started_at)
        log.info(
            "request_id=%s method=%s path=%s status=%s duration_ms=%.2f",
            request_id,
            method,
            path,
            status_code,
            duration_ms,
        )


def _get_request_id(scope: Scope) -> str:
    for name, value in scope.get("headers", []):
        if name == REQUEST_ID_HEADER.lower().encode("ascii"):
            decoded = value.decode("latin-1").strip()
            if decoded:
                return decoded
    return uuid.uuid4().hex


def _elapsed_ms(started_at: float) -> float:
    return (time.perf_counter() - started_at) * 1000
