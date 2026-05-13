# 第 1 周 · 约 1 分钟本地演示脚本

用于录屏或面试前试讲：单镜头、单环境（本机已起 **8000 + 3000**）。

## 0–10 秒：项目一句话

口述：**「AgentFlow AI 第 1 周：FastAPI 提供 SSE 与工具流，Next 前端三个工作区——需求结构化、Tool Calling、Chat Markdown 体验，API Key 只放在后端。」**

## 10–35 秒：需求分析（Day 3）

1. 浏览器打开 `http://localhost:3000`。
2. 默认在 **需求分析**：粘贴一小段产品需求，点 **分析**。
3. 口述：「后端用 system prompt 约束 JSON，Pydantic 校验；无 Key 时 mock 仍可演示。」

## 35–50 秒：工具流（Day 4）

1. 切到 **工具调用**，用默认或自带一句多任务提示，点 **发送**。
2. 口述：「SSE 里穿插 `tool_call` / `tool_result`，前端展示工具轨迹。」

## 50–60 秒：Chat 体验（Day 5）

1. 切到 **Chat 体验**，指出欢迎语里的 **Markdown / 代码块**。
2. 可选：发一句短问题，点 **停止** 或等流结束，口述：「AbortController + 失败重试。」

## 备用一句（被追问 SSE）

**「正文用 fetch + ReadableStream 按行切 `data:`；单向推送用 SSE 足够，和网关、Cookie 一致。」**
