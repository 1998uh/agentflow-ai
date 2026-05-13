# AgentFlow AI — HTTP API 说明

基址：本地默认 `http://127.0.0.1:8000`。浏览器开发时通常只访问 Next（`:3000`），由 `next.config` 将 `/api/*` **rewrite** 到此后端。

交互式文档：启动后端后打开 **Swagger UI**：`http://127.0.0.1:8000/docs`。

---

## 健康检查

### `GET /health`

**响应** `200`，JSON 示例：

```json
{ "status": "ok", "service": "AgentFlow AI" }
```

---

## 聊天

路由前缀：`/api/chat`（在 `app/main.py` 中与 `prefix="/api"` 组合）。

### `POST /api/chat`

非流式补全。**需要**配置 `OPENAI_API_KEY`；未配置时返回 `503`（不提供 mock）。

**请求体** `application/json`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `messages` | `array` | 至少 1 条；每项 `role`: `system` \| `user` \| `assistant`，`content` 非空字符串 |

**响应** `200`：`content`、`model`、`mocked`。

---

### `POST /api/chat/stream`

SSE 流式文本。**需要** `OPENAI_API_KEY`；未配置返回 `503`。

**请求体**：同 `POST /api/chat`。

**响应**：`Content-Type: text/event-stream`。每条事件为 SSE `data:` 行，载荷为 JSON 对象（UTF-8，`ensure_ascii` 与后端一致）。

| `type` | 说明 |
|--------|------|
| `meta` | 首包；含 `model`、`mocked` |
| `delta` | 增量文本，字段 `content` 为片段字符串 |
| `done` | 流结束标记 |

前端按 `\n\n` 分帧，取以 `data: ` 开头的行再 `JSON.parse`。

---

### `POST /api/chat/stream-tools`

带 **Tool Calling** 的 SSE。无 API Key 时走后端 **mock** 工具流（`mocked: true`），便于本地演示。

**请求体**：同聊天（`messages` 仅 `user`/`assistant` 等客户端角色即可，由模型与工具逻辑补全）。

**SSE `data:` JSON `type` 取值**：

| `type` | 主要字段 |
|--------|-----------|
| `meta` | `model`, `mocked` |
| `delta` | `content` |
| `tool_call` | `tool_call_id`, `name`, `arguments` |
| `tool_result` | `tool_call_id`, `name`, `content`, `ok` |
| `done` | 结束 |

---

## 需求分析（结构化输出）

### `POST /api/requirements/analyze`

对自然语言需求做结构化分析；无 Key 时返回可校验的 **mock** 数据。

**请求体**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `description` | `string` | 非空需求描述 |

**响应** `200`：

| 字段 | 类型 |
|------|------|
| `analysis` | 对象：`summary`，`user_stories[]`，`acceptance_criteria[]`，`risks[]` |
| `model` | 字符串 |
| `mocked` | 布尔 |

**错误**：模型输出无法解析/校验时可能 `502`，`detail` 为可读说明。

---

## CORS

后端从 `FRONTEND_ORIGIN`（默认 `http://localhost:3000`）允许浏览器直连 FastAPI。若前端仅用同源 rewrite，仍建议保持该变量与前端访问源一致。

---

## 环境变量（后端）

见仓库 `backend/.env.example`。与聊天相关的关键项：`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`、`FRONTEND_ORIGIN`、`LOG_LEVEL`。
