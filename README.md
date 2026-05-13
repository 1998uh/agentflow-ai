# AgentFlow AI（第 1 周）

求职向 **AI Agent 全栈** 练习项目：**FastAPI** 后端 + **Next.js** 前端，涵盖 SSE 流式聊天、结构化需求分析、Tool Calling 与 Chat Markdown 体验。

详细学习顺序见 [`docs/ai-agent-application-learning-roadmap.md`](./docs/ai-agent-application-learning-roadmap.md)。

## 仓库结构

```
agentflow-ai/
├── backend/          # FastAPI，OpenAI 兼容调用，SSE
├── frontend/         # Next.js App Router，rewrite → 后端 /api
├── docs/
│   ├── API.md                    # HTTP / SSE 接口说明（给人读）
│   ├── week1-demo-script.md    # 约 1 分钟录屏 / 试讲脚本
│   └── ai-agent-application-learning-roadmap.md
└── README.md
```

## 环境要求

- Python 3.11+（与 `backend` 依赖一致即可）
- Node 20+（与 Next 16 一致即可）

## 快速启动（两个终端）

**终端 1 — 后端**

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
# Windows: copy .env.example .env
# macOS/Linux: cp .env.example .env
cp .env.example .env   # 再编辑 .env 填入 OPENAI_API_KEY（流式聊天与 POST /api/chat 需要）
uvicorn app.main:app --reload --port 8000
```

**终端 2 — 前端**

```bash
cd frontend
npm install
# Windows: copy .env.example .env.local
# macOS/Linux: cp .env.example .env.local
cp .env.example .env.local   # 可选；默认空则同源 /api 走 rewrite
npm run dev
```

浏览器访问 **http://localhost:3000**。前端通过 `next.config.ts` 将 `/api/*` 转发到 `BACKEND_URL`（默认 `http://127.0.0.1:8000`）。

## 文档与演示

| 文档 | 说明 |
|------|------|
| [docs/API.md](./docs/API.md) | 路径、请求体、SSE 事件类型 |
| [docs/week1-demo-script.md](./docs/week1-demo-script.md) | 第 1 周约 1 分钟 demo 分镜 |
| 后端 Swagger | 启动后打开 `http://127.0.0.1:8000/docs` |

## 第 1 周阶段产出（简历一句话）

> **AI Chat v1**：FastAPI + Next.js + SSE + 真实模型调用 + 工具调用雏形；需求结构化分析；前端 Markdown Chat 与重试/停止体验。

## 说明

- **密钥**：只放在 `backend/.env`，勿提交仓库。
- **无 API Key**：`POST /api/requirements/analyze` 与 `POST /api/chat/stream-tools` 可走 mock；`POST /api/chat/stream` 与 `POST /api/chat` 当前需配置 Key（见 `docs/API.md`）。
