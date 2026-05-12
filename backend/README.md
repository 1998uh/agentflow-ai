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

