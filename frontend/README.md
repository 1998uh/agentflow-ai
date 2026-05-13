# AgentFlow AI — Frontend

Next.js（App Router）+ Tailwind。开发时页面入口：`src/app/page.tsx`（需求分析、Tool Calling、Chat 体验三个工作区）。

## 运行

```bash
npm install
npm run dev
```

默认 **http://localhost:3000**。API 请求走同源 **`/api/*`**，由 `next.config.ts` **rewrite** 到 FastAPI（默认 `http://127.0.0.1:8000`）。

## 环境变量

复制示例文件后按需修改：

```bash
cp .env.example .env.local
```

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_API_BASE_URL` | 一般为空：使用相对路径 `/api`。若前端与后端不同域直连，可填后端可访问的 API 根 URL。 |
| `BACKEND_URL` | 仅构建/开发时写入 Next 的 rewrite 目标；默认 `http://127.0.0.1:8000`。 |

## 构建

```bash
npm run build
npm start
```

## 仓库文档

- 接口说明（含 SSE）：仓库根目录 [`../docs/API.md`](../docs/API.md)
- 学习路线：[`../docs/ai-agent-application-learning-roadmap.md`](../docs/ai-agent-application-learning-roadmap.md)
