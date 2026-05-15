import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND_ROOT / ".env", override=True)

from app.api.chat import router as chat_router
from app.api.requirements import router as requirements_router
from app.core.config import get_settings
from app.core.errors import AppError, app_error_handler
from app.core.middleware import RequestContextMiddleware

settings = get_settings()


def _configure_app_logging() -> None:
    """Business logs under logger name prefix `app` (e.g. app.services.llm_service).

    Uvicorn's `--log-level` only affects uvicorn.* loggers. A dedicated StreamHandler on
    `app` ensures INFO/DEBUG from our code always prints to stderr regardless of root setup.
    """
    level_map = {
        "CRITICAL": logging.CRITICAL,
        "ERROR": logging.ERROR,
        "WARNING": logging.WARNING,
        "INFO": logging.INFO,
        "DEBUG": logging.DEBUG,
    }
    level = level_map.get(os.environ.get("LOG_LEVEL", "INFO").upper(), logging.INFO)

    fmt = logging.Formatter(
        "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
        "%H:%M:%S",
    )
    app_logger = logging.getLogger("app")
    app_logger.handlers.clear()
    handler = logging.StreamHandler()
    handler.setFormatter(fmt)
    handler.setLevel(level)
    app_logger.addHandler(handler)
    app_logger.setLevel(level)
    app_logger.propagate = False


_configure_app_logging()

app = FastAPI(title=settings.app_name)
app.add_exception_handler(AppError, app_error_handler)
app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router, prefix="/api")
app.include_router(requirements_router, prefix="/api")


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}

