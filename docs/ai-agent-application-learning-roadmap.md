# AI Agent 应用开发 2 个月就业学习路线

适用对象：有前端经验，想转向 AI 应用开发、AI Agent 全栈开发、大模型应用开发的工程师。

你的当前定位：

> 5 年前端工程师，转型 AI 应用全栈开发，擅长 React/Next.js 复杂交互，能用 Python/FastAPI 构建 RAG、Agent、工具调用、多 Agent 工作流和可观测系统。

这份路线的目标不是“学会调用大模型 API”，而是做出一个可以写进简历、可以面试展开讲、能对上市场 JD 的 AI Agent 项目。

## 目标岗位

优先投递这些岗位：

- AI 应用开发工程师
- AI Agent 全栈开发工程师
- 大模型应用开发工程师
- LLM 应用开发工程师
- RAG/Agent 应用工程师  
- AI 前端工程师，偏 Agent UI / Chat UI / Workflow UI
- AI Coding / IDE / Copilot 产品研发工程师

暂时不优先投：

- 大模型算法工程师
- NLP 算法工程师
- 模型训练工程师

原因：这些岗位更偏算法、论文、PyTorch、训练和微调。你的优势是前端工程经验、产品理解、交互能力，最适合切入 AI 应用全栈。

## 市场能力模型

AI 应用开发不是单点技能，而是综合能力。

按求职重要度排序：

1. Python 后端：FastAPI、Pydantic、异步接口、SSE、REST API、鉴权、日志。
2. AI 应用核心：Prompt、结构化输出、Function Calling、Tool Calling、上下文管理。
3. RAG：文档解析、chunk、embedding、向量检索、rerank、来源引用、幻觉控制。
4. Agent 工程：单 Agent、多 Agent、工具注册、任务规划、人工确认、失败重试、执行日志。
5. 前端 AI 交互：Chat UI、流式输出、Markdown/代码块、工具调用状态、任务时间线、Agent 工作流可视化。
6. 工程化部署：Docker、Postgres、Redis、队列、日志、监控、云部署。
7. 加分项：MCP、LangGraph、AI Coding 工具、VSCode 插件、Electron、Agent 评测体系。

## 主项目

项目名：

> AgentFlow AI：企业级 AI Agent 研发助手平台

项目定位：

一个面向研发团队的 AI Agent 平台，支持知识库问答、需求拆解、技术方案生成、工具调用、多 Agent 协作和执行链路追踪。

业务场景尽量选择“所有公司都可能需要”的方向：

- 企业知识库
- 客服助手
- 研发效能
- 运营助手
- AI Coding
- 内部工具平台

不要一开始做太冷门的垂直业务，例如医疗、法律、金融风控。除非你本身有对应行业经验，否则项目匹配面会变窄。

## 技术栈

前端：

- Next.js
- React
- TypeScript
- Tailwind CSS
- SSE / WebSocket
- Markdown / Code block rendering

后端：

- Python
- FastAPI
- Pydantic
- Uvicorn
- async/await

AI：

- OpenAI API / DeepSeek API / 豆包 API
- OpenAI Agents SDK Python
- LangGraph
- Tool Calling
- Structured Output

RAG：

- PostgreSQL
- pgvector
- 文档解析
- embedding
- 混合检索
- rerank

工程化：

- Docker Compose
- Redis
- Celery / RQ
- 日志系统
- tracing
- 简单评测集

## 2 个月总体安排

第 1-2 周：AI 应用基础和全栈最小闭环。

第 3-4 周：RAG 企业知识库。

第 5-6 周：Agent、工具调用、多 Agent 协作。

第 7-8 周：工程化、可观测、评测、权限、部署和简历包装。

## 第 1 周：FastAPI + Next.js AI Chat

目标：

做出一个完整的 AI Chat 系统，支持前端输入、后端请求模型、SSE 流式返回。

### Day 1：项目骨架和 SSE 最小闭环

学习内容：

- FastAPI 基础
- Pydantic 请求模型
- Next.js 页面
- SSE 流式响应
- 前端读取 ReadableStream

开发任务：

- 创建 `backend`
- 创建 `frontend`
- 后端提供 `/api/chat/stream`
- 前端实现聊天界面
- 无 API Key 时使用 mock 模型

产出：

- 一个可以跑起来的 AI Chat 页面
- 后端 SSE 能返回 `data:` 事件

面试要会讲：

- 为什么 AI Chat 常用 SSE？
  - **口述要点**：生成式回复本质是「服务端持续往客户端推文本片段」；SSE 基于标准 HTTP（`text/event-stream`），和现有 REST、Cookie、网关、鉴权模型一致；浏览器有原生 `EventSource`，多数场景只需**单向**服务端→客户端流，不必全双工。
- SSE 和 WebSocket 区别是什么？
  - **口述要点**：SSE 主要是**服务端推送**、文本帧、语义上适合「模型吐字」；WebSocket 是**全双工**、二进制友好，适合协作编辑、游戏、高频双向信令。Chat 以模型流为主时 SSE 足够，运维与中间层兼容成本往往更低。
- 前端如何消费流式响应？
  - **口述要点**：`fetch` 后读 `response.body.getReader()`，循环 `read()` 得到 `Uint8Array`，用 `TextDecoder` 解码成字符串，再按协议切分（例如按行解析 `data:`）；若接口设计为纯 SSE，也可用 `EventSource`（注意仅 GET、自定义 Header 受限时需配合 polyfill 或仍用 fetch 流）。

### Day 2：接入真实大模型 API

学习内容：

- OpenAI / DeepSeek / 豆包 API 调用
- 模型供应商封装
- 环境变量管理
- API Key 安全

开发任务：

- 给 `LLMService` 接入真实模型
- 支持配置 `OPENAI_API_KEY`
- 支持配置 `OPENAI_BASE_URL`
- 保留 mock fallback

产出：

- 前端能看到真实模型的流式回复

面试要会讲：

- 为什么要抽象模型服务层？
  - **口述要点**：把「选模型、拼消息、流式解析、重试、超时、计费日志」收口在一层，路由和业务代码只依赖稳定接口；换供应商或换 SDK 时改动面小；便于单测和 **mock**（无 Key、压测、CI 都不碰真实 API）。
- 如何支持多个模型供应商？
  - **口述要点**：**配置驱动**（`base_url`、`model`、`api_key` 来自环境变量或配置中心）；各供应商差异用**适配器**或统一封装（消息格式、流字段名、错误类型映射成内部枚举）；上层只传「业务消息 + 任务类型」，不关心底层是 OpenAI 兼容还是豆包原生。
- API Key 为什么不能放前端？
  - **口述要点**：前端 bundle、网络抓包、浏览器扩展都能拿到 Key，等于**公开密钥**，会被盗刷产生费用与数据风险；正确做法是**仅后端**持有 Key，浏览器只调自家后端；若必须浏览器直连，也应使用**短期 token / 代理网关**由后端签发，而不是把主 Key 写进前端。

### Day 3：Prompt 和结构化输出

学习内容：

- system prompt
- developer prompt
- user prompt
- JSON Schema
- Pydantic 校验

开发任务：

- 新增 `/api/requirements/analyze`
- 输入一段需求描述
- 输出结构化 JSON：需求摘要、用户故事、验收标准、风险点

产出：

- 需求分析接口
- 前端展示结构化分析结果

面试要会讲：

- 为什么模型输出 JSON 不一定稳定？
  - **口述要点**：大模型是**概率生成**，不是编译器；同一提示多次结果可能不同。常见问题包括：夹杂自然语言或 Markdown 围栏、多个 JSON 拼在一起、`max_tokens` **截断**导致括号不配、字段名漂移、字符串里未转义引号；不同 API 对 `reasoning`、工具调用字段的返回也不一致。所以不能假设「看起来像 JSON」就一定可解析、可入库。
- 怎么做结构化输出校验？
  - **口述要点**：**协议层**优先用官方 JSON mode / structured output / function arguments，降低格式错误；**语法层** `json.loads`，失败可带错误信息 **重试** 或让模型自修复；**语义层**用 **Pydantic 或 JSON Schema** 校验类型、必填、枚举、嵌套；仍失败要**明确报错**，避免静默写入脏数据（你本仓库「解析 + 校验 + 二次对话修正」就是典型组合）。
- 结构化输出适合哪些业务场景？
  - **口述要点**：适合下游要**自动消费**的场景：需求/工单拆解、实体与关系抽取、路由分类、**工具调用参数**、可版本化的配置草案、表格化展示。不适合单独依赖「无人工把关」输出做医疗/法律/金融等**高风险决策**；创意长文可「叙述 + 少量结构化摘要」混合。

### Day 4：Tool Calling 基础

学习内容：

- Function Calling / Tool Calling
- 工具 schema
- 工具执行
- 模型根据上下文选择工具

开发任务：

- 实现 3 个本地工具：
  - `search_project_docs`
  - `create_task_plan`
  - `generate_api_mock`
- 前端展示工具调用过程

产出：

- 一个能调用工具的 AI 助手

面试要会讲：

- Tool Calling 和普通 prompt 有什么区别？
- 为什么工具需要 schema？
- 工具调用失败怎么处理？

### Day 5：AI Chat 产品体验

**前提（你当前仓库）**：前后端已跑通；前端主入口在 `frontend/src/app/page.tsx`（含普通 Chat、`readSseStream` 解析 SSE、`AbortController` 停止、Tools 工作区）。Day 5 **以前端为主线**，后端仍以既有 `POST /api/chat/stream`（及可选 `stream-tools`）为准，尽量不扩路由。

**前端今日学习路线（按顺序做，约 1 天）**

1. **读透流式消费**：在 `page.tsx` 里跟一遍 `handleSubmit` → `fetch(..., { signal })` → `readSseStream` → 按事件类型更新 `messages`。能口述：`meta` / `delta` / `done` 各干什么；为什么增量用「当前助手消息 id」做 `map` 更新。
2. **助手气泡上 Markdown**：只改**助手**侧渲染（用户气泡可继续纯文本）。安装 `react-markdown`，按需加 `remark-gfm`（表格、删除线、任务列表）。流式阶段不必等全文结束再渲染，Markdown 解析器会随字符串变长反复排版，注意性能即可（长文再考虑防抖或分段）。
3. **代码块体验**：自定义 `components.code`：等宽字体、`overflow-x-auto`、可选「复制」按钮；语言高亮可用 `react-syntax-highlighter` 或 Shiki（二选一，先跑通再优化）。长代码块加 `max-height` + 内部滚动，避免一屏被撑死。
4. **安全默认**：不直接把模型输出塞进 `dangerouslySetInnerHTML`；若用 `rehype-raw` 之类，必须配 **DOMPurify** 或不用 raw。外链 `<a>` 统一 `rel="noopener noreferrer"`，`target="_blank"`。
5. **状态机落到 UI**：为每条助手消息维护显式 `status`（或从「是否最后一条 + isStreaming + error」推导），区分：等待首包、生成中、已完成、失败、用户取消。加载文案与「工具执行中」不要混用两套逻辑（Tools 区可复用同一套视觉规范）。
6. **停止与错误**：对齐已有「停止」按钮：`abort()` 后 `isStreaming` 必须落地；`catch` 里过滤 `AbortError`，取消不要用红色错误条。网络错误展示在输入区上方，并考虑清空或保留半条助手内容的产品决策（二选一写进注释）。
7. **重试（前端闭环）**：在错误条或助手气泡上增加「重试」：只重发**上一轮 user 内容**，新建或清空助手占位，**禁止**在旧 `id` 上拼接两次流，避免内容重复。
8. **（加分）会话不落盘**：用 `sessionStorage` 存 `messages` JSON，挂载时 `hydrate`；注意体积与 `JSON.parse` 失败兜底。
9. **（加分）Tools 区助手气泡**：与普通 Chat 共用同一套 Markdown/代码块组件，避免两套样式分叉。

**本仓库落点（查代码从这里开始）**

- `frontend/src/app/page.tsx`：消息状态、`readSseStream`、`stopStreaming` / `stopToolsStreaming`、错误区、Tailwind 气泡样式。
- `frontend/package.json`：当前无 `react-markdown`，Day 5 会新增依赖；保持 Next 16 + React 19 兼容版本即可。
- 同源代理：`NEXT_PUBLIC_API_BASE_URL` 与 `next.config` 里对 `/api` 的 rewrites（若为空则走同源）。
- 后端事件形状参考 `backend/app/api/chat.py` 的 SSE `data:` JSON（`type` 字段），前端解析逻辑与之一一对应。

学习内容：

- **Markdown 与富文本**：助手消息用 Markdown 渲染（标题、列表、链接、表格）；用户气泡可保持纯文本或轻量格式化；流式场景下「边收边渲染」与最终排版一致性的取舍。
- **代码块**：围栏代码块、语言标签（` ```ts `）、复制按钮；可选语法高亮（如 Shiki / Prism）；长代码折叠与横向滚动，避免撑破布局。
- **安全与 XSS**：不信任模型输出为 HTML；`dangerouslySetInnerHTML` 默认避免；若必须 HTML，先做白名单消毒（DOMPurify 等）；链接 `rel="noopener noreferrer"`、禁止 `javascript:` 协议。
- **消息状态机**：空闲 → 发送中 → 流式生成中 → 成功 / 失败 / 已取消；每条助手消息可带 `status`（`pending` | `streaming` | `done` | `error` | `aborted`），与 UI（骨架屏、打字光标、重试按钮）一一对应。
- **停止生成（Abort）**：`fetch` 传 `AbortController.signal`；用户点「停止」时 `abort()`；区分 `AbortError` 与普通网络错误，不把取消当成失败红条。
- **错误与重试**：网络 / 5xx / 解析失败时展示可读错误；重试可「同一条助手消息重新请求」或「复制用户问题再发」；注意与流式增量 `setState` 的竞态（见下）。
- **消息历史**：会话级 `messages` 数组即最小历史；刷新丢失问题用 `sessionStorage` / 后端会话 id（第 2 周再加深）；列表虚拟化在长会话时再考虑。

开发任务：

- **前端（必做）**：在 `frontend/src/app/page.tsx` 的 Chat 工作区，助手气泡接入 Markdown + 代码块组件；完善加载 / 错误 / 取消的文案与样式；实现一轮对话的「重试」按钮。
- **前端（选做）**：抽出 `components/chat/AssistantMessage.tsx`（或同目录）复用到 Tools 助手气泡；`sessionStorage` 会话恢复。
- **后端**：Day 5 不要求改接口；若重试需幂等 id，可留到第 2 周再与请求 ID 一起做。

产出：

- **今日最小闭环（前端）**：助手回复可渲染 Markdown 与可复制代码块；流式过程中 UI 不抖；可停止；失败可重试且不串消息。
- **整周视角**：一个接近真实产品体验的 Chat UI：可读的结构化回复、安全的代码展示、可取消的流式生成、可恢复的错误与重试。

面试要会讲：

- AI 前端和普通 CRUD 前端有什么不同？
  - **口述要点**：CRUD 多是**确定状态**：请求成功即整页数据替换。AI 前端是**长时、流式、概率**：同一操作输出长度与内容不固定；要处理**生成中、中断、重试、多模态（文本/工具/卡片）**；用户体验核心在**等待可感知、可取消、可恢复**，而不是只调一个接口拿 JSON。
- 流式 UI 怎么避免状态错乱？
  - **口述要点**：**消息 id 锚定**：增量只追加到「当前这一轮助手消息」；**闭包与竞态**：用 ref 存「当前请求 id」或比较 `assistantMessage.id`，丢弃过期 `read()` 回调；**StrictMode 双调用**开发时注意 effect 清理；**取消**后不再对旧 `assistant` 做 `setState`；**重试**时新建助手占位或显式重置内容，避免半条 + 半条拼接。

### Day 6-7：第 1 周整合

**前提**：Day 1–5 功能已在仓库跑通。本阶段把「能跑的 demo」收成**可展示、可交接、可写进简历**的一页纸项目。

学习内容：

- **仓库与文档**：单仓前后端目录约定、根 README 一页启动、环境变量示例与真实密钥分离。
- **接口契约**：REST + SSE 的路径、请求体、事件 `type`、错误码；与 OpenAPI（`/docs`）对照阅读。
- **演示节奏**：1 分钟内讲清「问题 → 架构 → 三条用户路径（需求 / 工具 / Chat）」。

开发任务：

- 整理项目结构（目录职责写进 README，不必大改代码树）。
- 补全根目录、`backend/`、`frontend/` 的 README；`frontend/.env.example` 与 `backend/.env.example` 保持可拷贝即用。
- 补接口文档：仓库 `docs/API.md`（与 `http://127.0.0.1:8000/docs` 互补）。
- 按 `docs/week1-demo-script.md` 录或试讲一遍约 1 分钟本地 demo。

**本仓库落点**：`README.md`、`docs/API.md`、`docs/week1-demo-script.md`、`backend/.env.example`、`frontend/.env.example`。

产出：

- 新人按 README 可在双终端起全栈；API 有独立 Markdown + Swagger；你有一条熟练的 1 分钟 demo 话术。

面试要会讲：

- 第 1 周你交付了什么？
  - **口述要点**：**全栈最小闭环**：FastAPI 暴露聊天与需求分析；Next 消费 **SSE** 与 Markdown Chat；**Tool Calling** 雏形；**API Key 仅后端**；无 Key 时需求分析与工具流仍可 **mock** 演示，流式聊天依赖真实 Key（与当前实现对齐）。
- 接口文档放哪里、给谁看？
  - **口述要点**：**对内** Markdown（`docs/API.md`）便于 PR/版本库与离线；**对人联调** FastAPI 自带 **OpenAPI**（`/docs`）可试请求；前后端契约以 **Pydantic schema + 实际 SSE 行**为准，文档随改随更。

阶段产出：

> AI Chat v1：FastAPI + Next.js + SSE + 真实模型调用 + 工具调用雏形。

## 第 2 周：AI 应用后端能力强化

目标：

把项目从 demo 变成工程化服务。

学习内容：

- FastAPI 路由分层
- service/repository 分层
- Pydantic schemas
- 错误处理
- 日志
- 请求 ID
- 模型调用超时
- 重试
- token 成本统计

开发任务：

- 重构后端目录结构
- 增加统一错误响应
- 增加请求日志
- 增加模型调用日志
- 增加 token/cost 字段
- 增加简单的会话存储

阶段产出：

> AI Chat v2：具备基础工程结构、日志、错误处理和会话能力。

面试要会讲：

- FastAPI 项目如何分层？
- 模型接口超时怎么办？
- 模型供应商挂了怎么办？
- 如何统计 token 成本？

## 第 3 周：RAG 文档知识库

目标：

做出企业知识库问答系统。

学习内容：

- 文档上传
- PDF / Markdown / TXT 解析
- chunk 切片
- embedding
- 向量数据库
- pgvector
- topK 检索

开发任务：

- 新增文档上传接口
- 解析文档文本
- 文本切片
- 生成 embedding
- 入库 pgvector
- 实现知识库检索

阶段产出：

> Knowledge Base v1：支持上传文档、入库、向量检索。

面试要会讲：

- RAG 完整链路是什么？
- chunk size 怎么选？
- overlap 有什么作用？
- 向量数据库和普通数据库有什么区别？

## 第 4 周：RAG 优化和评测

目标：

让知识库问答更像企业可用系统。

学习内容：

- 混合检索
- rerank
- metadata filter
- 来源引用
- 无答案拒答
- RAG 评测集

开发任务：

- RAG 回答附带来源
- 支持按项目、文档类型过滤
- 加入关键词检索
- 实现简单混合检索
- 准备 20 条评测问题
- 输出命中率报告

阶段产出：

> Knowledge Base v2：支持来源引用、混合检索、基础评测。

面试要会讲：

- 如何提升 RAG 召回率？
- 如何降低幻觉？
- 为什么要做 RAG 评测？
- topK 越大越好吗？

## 第 5 周：Agent 和工具系统

目标：

从“问答系统”升级为“能做事的 Agent”。

学习内容：

- Agent Loop
- plan / act / observe / answer
- Tool Calling
- 工具权限
- 工具执行日志
- 人工确认

开发任务：

- 设计工具注册中心
- 实现工具 schema
- 实现工具执行器
- Agent 调用知识库检索工具
- Agent 生成任务拆解
- 高风险工具增加确认流程

阶段产出：

> Agent v1：能调用工具完成需求分析和任务拆解。

面试要会讲：

- Agent 和 ChatBot 的区别是什么？
- Agent 为什么容易失控？
- 如何限制 Agent 工具权限？
- 工具执行失败怎么重试？

## 第 6 周：多 Agent 协作

目标：

实现一个能写进简历的多 Agent 工作流。

Agent 角色：

- PM Agent：理解需求、提炼用户故事
- Architect Agent：生成技术方案
- Frontend Agent：拆前端组件和状态管理
- QA Agent：生成测试用例
- Reviewer Agent：审查风险和遗漏

开发任务：

- 输入 PRD
- 多 Agent 协作输出完整研发方案
- 前端展示执行步骤
- 展示每个 Agent 的中间结果
- 保存最终分析报告

阶段产出：

> Requirement Agent：输入 PRD，输出需求摘要、页面结构、接口设计、组件拆分、测试点、风险清单。

面试要会讲：

- 多 Agent 什么时候有必要？
- Handoff 和 manager agent 有什么区别？
- 多 Agent 如何共享上下文？
- 如何避免多个 Agent 互相污染输出？

## 第 7 周：工程化、权限、可观测

目标：

把项目讲成企业级 AI 应用，而不是玩具项目。

学习内容：

- 用户鉴权
- 项目空间
- 工具权限
- tracing
- 执行日志
- token 成本
- 降级策略
- Redis 队列
- Docker Compose

开发任务：

- 用户登录 mock 或基础 JWT
- 项目空间隔离
- 工具权限配置
- 记录每次模型调用
- 记录每次工具调用
- token 成本统计
- 失败重试
- Docker Compose 启动前后端、数据库、Redis

阶段产出：

> AgentFlow AI v0.9：具备项目空间、权限、日志、成本统计和容器化能力。

面试要会讲：

- 如果模型调用失败怎么办？
- 如果 Agent 调错工具，怎么追踪？
- 如何做工具权限控制？
- 如何控制 token 成本？
- 如何做服务降级？

## 第 8 周：MCP、简历、部署、面试

目标：

把项目打磨成能投简历、能面试展示的版本。

学习内容：

- MCP 基础
- Agent 工具服务化
- README 写法
- 架构图
- 部署
- 面试表达

开发任务：

- 做一个简化 MCP server
- 把知识库搜索作为工具暴露
- 写项目 README
- 画系统架构图
- 部署到云服务器或 Vercel + 后端服务
- 准备项目演示脚本
- 准备 30 个面试问题

阶段产出：

> AgentFlow AI v1.0：完整可展示、可部署、可写简历的 AI Agent 应用平台。

## 最终项目功能清单

必须有：

- AI Chat
- SSE 流式响应
- 模型服务层
- 文档上传
- RAG 检索
- 来源引用
- Tool Calling
- Agent 任务拆解
- 多 Agent 协作
- 工具调用过程展示
- 执行日志
- Docker Compose
- README

最好有：

- 用户登录
- 项目空间
- 工具权限
- 人工确认
- token 成本统计
- RAG 评测集
- MCP 工具服务
- 部署地址

## 简历项目描述

项目名称：

> AgentFlow AI 企业级 Agent 研发助手平台

项目描述：

> 基于 Next.js、Python FastAPI、PostgreSQL pgvector、OpenAI Agents SDK / LangGraph 构建企业级 AI Agent 应用平台，支持知识库 RAG、多 Agent 协作、工具调用、需求拆解、技术方案生成、链路追踪和评测体系。

技术亮点：

- 使用 SSE 实现大模型流式输出，前端实时展示 Agent 思考、工具调用和执行状态。
- 基于 pgvector 构建 RAG 知识库，支持文档解析、切片、embedding、混合检索和来源引用。
- 设计 Tool Calling 工具系统，支持工具权限、人工审批、失败重试和执行日志。
- 基于多 Agent 架构实现需求分析、技术方案、测试用例、风险审查等协作流程。
- 建立评测集、调用日志、token 成本统计和异常追踪，提升 AI 输出稳定性和可观测性。

## 面试高频问题

RAG 方向：

- RAG 的完整链路是什么？
- chunk size 和 overlap 怎么选？
- 如何提升召回率？
- 如何降低幻觉？
- topK 越大越好吗？
- 向量数据库为什么不能替代传统数据库？
- 混合检索是什么？
- rerank 有什么作用？

Agent 方向：

- Agent 和 ChatBot 的区别是什么？
- Function Calling 和 Tool Calling 的区别是什么？
- Agent Loop 是什么？
- 多 Agent 什么时候有必要？
- Agent 怎么做权限控制？
- Agent 调错工具怎么办？
- 怎么做人工确认？
- 怎么做工具注册中心？

工程方向：

- AI Chat 为什么用 SSE？
- SSE 和 WebSocket 怎么选？
- 模型接口超时怎么办？
- 模型供应商挂了怎么办？
- 如何统计 token 成本？
- 如何做日志和链路追踪？
- 如何做服务降级？
- 如何防 Prompt Injection？

前端方向：

- 流式输出 UI 怎么实现？
- Markdown 和代码块如何渲染？
- 工具调用状态如何展示？
- Agent 执行时间线怎么设计？
- 如何处理用户中断生成？
- 如何避免消息状态错乱？

## 薪资阶段判断

只会调 API：

> 10K-15K

会 FastAPI + 前端 + 基础 AI Chat：

> 15K-20K

会 RAG + Agent 项目落地：

> 20K-30K

会工程化、评测、权限、稳定性、成本优化：

> 30K+

能讲清楚企业级 Agent 平台设计、多业务复用、工具治理、跨 Agent 记忆、MCP 集群：

> 才有机会冲 40K

## 每天学习节奏

如果工作日时间少，按这个节奏：

- 20 分钟：看当天概念
- 40 分钟：写一个小功能
- 20 分钟：整理今天学到的 3 个面试点

如果当天有 2-3 小时：

- 30 分钟：学概念
- 90 分钟：写代码
- 30 分钟：调试和复盘
- 15 分钟：补 README 或面试话术

## 学习原则

不要做 10 个散乱 demo。

要围绕一个主项目持续迭代，让它从：

> AI Chat -> RAG 知识库 -> Agent 工具系统 -> 多 Agent 平台 -> 企业级工程化项目

不要只说“我会 LangChain”。

要能说清楚：

- 为什么这么设计？
- 这个方案解决什么业务问题？
- 出错怎么排查？
- 效果怎么评估？
- 成本怎么控制？
- 权限怎么隔离？
- 后续怎么扩展？

这才是从普通开发转 AI 应用开发的核心。

