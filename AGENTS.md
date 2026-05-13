# AgentFlow AI 项目阅读摘要

本文档记录当前项目的只读梳理结果，供后续开发、维护和 Agent 接手时快速了解项目现状。

## 1. 项目技术栈

- 后端：Python、FastAPI、Uvicorn、Pydantic / pydantic-settings、python-dotenv、OpenAI Python SDK。
- 模型调用：OpenAI-compatible Chat Completions。默认配置偏向 DeepSeek：
  - `OPENAI_BASE_URL=https://api.deepseek.com`
  - `OPENAI_MODEL=deepseek-chat`
- 前端：Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4。
- UI 与渲染依赖：`lucide-react`、`react-markdown`、`remark-gfm`。
- 前后端通信：普通 HTTP 与 SSE `text/event-stream`。
- 开发代理：前端通过 Next.js rewrite 将 `/api/*` 转发到 FastAPI。

## 2. 目录结构

```text
agentflow-ai/
├─ backend/
│  ├─ app/
│  │  ├─ main.py              # FastAPI 入口、CORS、路由注册、健康检查
│  │  ├─ api/                 # chat、requirements 路由
│  │  ├─ core/                # 配置读取
│  │  ├─ schemas/             # Pydantic 请求/响应模型
│  │  └─ services/            # LLMService、本地工具
│  ├─ requirements.txt
│  ├─ .env.example
│  └─ README.md
├─ frontend/
│  ├─ src/app/                # Next App Router 页面、布局、全局样式
│  ├─ src/components/chat/    # Markdown 渲染组件
│  ├─ package.json
│  ├─ next.config.ts
│  ├─ .env.example
│  └─ README.md
├─ docs/
│  ├─ API.md
│  ├─ week1-demo-script.md
│  └─ ai-agent-application-learning-roadmap.md
└─ README.md
```

## 3. 启动方式

后端：

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

前端：

```powershell
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

常用地址：

- 前端页面：`http://localhost:3000`
- 后端健康检查：`http://127.0.0.1:8000/health`
- FastAPI Swagger：`http://127.0.0.1:8000/docs`

## 4. 核心业务模块

- 聊天接口：`backend/app/api/chat.py`
  - `POST /api/chat`
  - `POST /api/chat/stream`
  - `POST /api/chat/stream-tools`
- 需求分析接口：`backend/app/api/requirements.py`
  - `POST /api/requirements/analyze`
  - 使用 system prompt 约束模型输出 JSON，再用 Pydantic 校验。
- LLM 服务：`backend/app/services/llm_service.py`
  - 模型客户端构建。
  - mock 模式。
  - SSE 流式输出。
  - Tool Calling 多轮执行。
  - 结构化 JSON 解析与一次修复重试。
- 本地工具：`backend/app/services/agent_tools.py`
  - `search_project_docs`
  - `create_task_plan`
  - `generate_api_mock`
- 前端工作台：`frontend/src/app/page.tsx`
  - Day 3 需求分析。
  - Day 4 Tool Calling。
  - Day 5 Chat 体验。
  - SSE 读取、停止、重试、工具轨迹展示。
- Markdown 渲染：`frontend/src/components/chat/AssistantMarkdown.tsx`

## 5. 当前项目可能存在的维护风险

- 前端主页面过大：`frontend/src/app/page.tsx` 同时承载 UI、状态管理、SSE 解析、重试逻辑和工具展示，后续功能增长后维护成本较高。
- 测试缺失：当前未看到后端 pytest、前端单元测试或端到端测试配置。SSE、Tool Calling、JSON 修复这类逻辑建议补测试。
- 文档编码或一致性风险：部分 README/API 文档在当前终端读取时出现中文乱码；文档中的模型示例与实际默认配置也存在不完全一致的迹象。
- 依赖管理混用：前端同时存在 `package-lock.json` 和 `pnpm-lock.yaml`，团队协作时容易出现安装结果不一致。
- mock 与真实模型路径差异较大：无 API Key 时部分接口走 mock，`/api/chat/stream` 和 `/api/chat` 则要求真实 Key，联调时容易误判功能状态。
- Tool Calling 工具仍是 demo 级实现：文档检索是硬编码切片，不是真实 RAG；工具参数校验较轻，接生产工具前需要加强白名单、超时、审计和错误边界。
- 配置与部署边界较薄：目前主要面向本地开发，生产环境的 CORS、多环境配置、日志格式、安全策略和健康检查深度仍需补齐。

