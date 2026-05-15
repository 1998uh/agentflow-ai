from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/.env — 不依赖启动 uvicorn 时的当前工作目录
_BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "AgentFlow AI"
    app_env: str = "development"
    openai_api_key: str = ""
    # OpenAI 兼容客户端：DeepSeek 官方 base 无 /v1 后缀（SDK 会拼路径）
    openai_base_url: str = "https://api.deepseek.com"
    # 可被环境变量 OPENAI_MODEL 覆盖；用 OpenAI 官方时改为如 gpt-4o-mini
    openai_model: str = "deepseek-chat"
    llm_request_timeout_seconds: float = 20.0
    llm_max_retries: int = 2
    llm_retry_backoff_seconds: float = 0.5
    frontend_origin: str = "http://localhost:3000"

    model_config = SettingsConfigDict(
        env_file=_BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("openai_api_key", mode="before")
    @classmethod
    def strip_api_key(cls, value: object) -> str:
        if value is None:
            return ""
        return str(value).strip()


@lru_cache
def get_settings() -> Settings:
    return Settings()

