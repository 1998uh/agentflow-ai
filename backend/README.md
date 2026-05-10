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

