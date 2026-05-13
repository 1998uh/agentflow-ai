# AgentFlow AI Backend

FastAPI backend for the AgentFlow AI learning project.

## Run

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Without an API key, the backend uses a local mock streaming response so the full app can run on day 1.

## Model Provider

The backend calls an OpenAI-compatible chat completions API when `OPENAI_API_KEY` is set in `.env`.

```env
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
```

If your relay provider gives you a root gateway URL such as `https://alexai.work`, put that root URL in `.env`. The backend normalizes it to the `/v1` API path before passing it to the OpenAI SDK.

Keep API keys in the backend `.env` file only. The frontend should call this FastAPI service, never the model provider directly.

## Logging

Application code logs under names like `app.api.chat` and `app.services.llm_service`. **`app/main.py` attaches its own `StreamHandler` to the `app` logger** so those lines always go to **stderr in the same terminal** as Uvicorn, independent of Uvicorn’s `--log-level` (that flag only tunes `uvicorn.*` loggers).

Set verbosity with **`LOG_LEVEL`** (`INFO` by default if unset):

```env
LOG_LEVEL=DEBUG
```

```bash
LOG_LEVEL=DEBUG uvicorn app.main:app --reload --port 8000
```

`app/main.py` loads `.env` via `python-dotenv` before configuring logging, so a line in `.env` is enough.

With **`LOG_LEVEL=INFO`** you should already see lines such as `stream_with_tools start` and `chat/stream-tools begin` when you use the frontend. Use **`DEBUG`** for each SSE event type and tool argument previews.

Typical lines you will see:

| Area | Level | What |
|------|--------|------|
| `app.api.chat` | INFO | `/api/chat/stream` and `/api/chat/stream-tools` start/end, message count, mocked flag, role list |
| `app.api.chat` | DEBUG | Each SSE event `type` for `stream-tools` |
| `app.services.llm_service` | INFO | Tool round index, model `tool_calls` names, final reply length/preview, mock tool plan |
| `app.services.llm_service` | DEBUG | Requirements analyze payload, provider `messages` role snapshot, raw tool argument previews |
| `app.services.llm_service` | WARNING | Provider errors, bad tool JSON args |
| `app.services.agent_tools` | INFO | Each `run_tool` success: result length + short preview |
| `app.services.agent_tools` | DEBUG | Tool name + argument keys before execution |

Long tool outputs are truncated in logs (preview only). Uvicorn’s own `--log-level` controls the server/access log noise; it does not replace `LOG_LEVEL` for the `app` package.
