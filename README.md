# AgentFlow AI

Two-month AI application development learning project for building an employable Agent/RAG full-stack portfolio.

## Day 1 Scope

- FastAPI backend with `/health`, `/api/chat`, and `/api/chat/stream`
- Next.js chat workspace
- SSE streaming from backend to frontend
- Local mock LLM mode when no API key is configured

## Day 2 Scope

- OpenAI-compatible model provider integration in `LLMService`
- Backend-only `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL` config
- Real non-streaming and streaming chat responses when an API key is configured
- Mock fallback when no API key is configured

## Start Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

## Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Learning Path

Day 3 will add prompt design and structured JSON output.

