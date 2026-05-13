"use client";

import { type ReactNode, FormEvent, useCallback, useMemo, useRef, useState } from "react";
import {
  Bot,
  CheckCircle2,
  ClipboardList,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
  Sparkles,
  User,
  Wrench,
} from "lucide-react";

import { AssistantMarkdown } from "@/components/chat/AssistantMarkdown";

type Role = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: Role;
  content: string;
};

type ToolTraceItem = {
  toolCallId?: string;
  name: string;
  arguments?: Record<string, unknown>;
  result?: string;
  ok?: boolean;
  phase: "running" | "done";
};

type ToolsChatMessage = {
  id: string;
  role: Role;
  content: string;
  toolTrace: ToolTraceItem[];
};

type StreamEvent =
  | { type: "meta"; content?: string; mocked?: boolean; model?: string }
  | { type: "delta"; content?: string; mocked?: boolean; model?: string }
  | {
      type: "tool_call";
      tool_call_id?: string;
      name: string;
      arguments?: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      tool_call_id?: string;
      name: string;
      content?: string;
      ok?: boolean;
    }
  | { type: "done"; content?: string };

type RequirementsAnalysis = {
  summary: string;
  user_stories: string[];
  acceptance_criteria: string[];
  risks: string[];
};

type RequirementsAnalyzeResponse = {
  analysis: RequirementsAnalysis;
  model: string;
  mocked: boolean;
};

/** 默认空字符串：请求同源 `/api/*`，由 next.config 的 rewrites 转发到 FastAPI。 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "你好，我是 **AgentFlow AI**（Day 5）。本页助手气泡已支持 **Markdown** 与 `代码块`。\n\n```ts\nconst ok = true;\n```\n\n试试让我列出 SSE 消费步骤，或点「停止」验证中断。",
  },
];

const dayThreeGoals = [
  "后端：system prompt 约束只输出 JSON",
  "POST /api/requirements/analyze + Pydantic 模型",
  "解析失败时自动发起一次「修复 JSON」重试",
  "前端分区展示摘要、用户故事、验收标准、风险",
];

const initialToolsMessages: ToolsChatMessage[] = [
  {
    id: "welcome-tools",
    role: "assistant",
    content:
      "你好，这是 Day 4「Tool Calling」工作区。可以试试：让我检索项目文档、拆解任务计划，或生成 FastAPI 路由草稿。无 API Key 时会走本地 mock 工具流。",
    toolTrace: [],
  },
];

const dayFourGoals = [
  "三个本地工具：search_project_docs / create_task_plan / generate_api_mock",
  "后端多轮 tool_calls → 执行 → role=tool 写回 → 最终自然语言",
  "POST /api/chat/stream-tools，SSE 事件含 tool_call、tool_result、delta",
  "前端展示工具参数与返回摘要",
];

const dayFiveGoals = [
  "助手气泡：react-markdown + remark-gfm（表格、任务列表等）",
  "代码块：复制按钮 + 滚动区域，避免撑破布局",
  "fetch + AbortController：停止与 AbortError 不误报红条",
  "失败可重试：同一轮 user 上下文重新拉流，避免半条拼接",
];

type ApiChatMessage = { role: Role; content: string };

export default function Home() {
  const [workspace, setWorkspace] = useState<"chat" | "requirements" | "tools">("requirements");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("用三句话解释：为什么结构化输出要在服务端做校验？");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const [chatRetry, setChatRetry] = useState<{ assistantId: string; apiMessages: ApiChatMessage[] } | null>(
    null,
  );
  const [runtimeMode, setRuntimeMode] = useState("unknown");
  const [modelName, setModelName] = useState("gpt-4.1-mini");
  const abortControllerRef = useRef<AbortController | null>(null);

  const [toolsMessages, setToolsMessages] = useState<ToolsChatMessage[]>(initialToolsMessages);
  const [toolsInput, setToolsInput] = useState(
    "先用文档检索总结 SSE，再给一个 3 阶段任务计划，最后为 POST /api/demo 写一个 FastAPI 草稿。",
  );
  const [toolsStreaming, setToolsStreaming] = useState(false);
  const [toolsError, setToolsError] = useState("");
  const [toolsRetry, setToolsRetry] = useState<{ assistantId: string; apiMessages: ApiChatMessage[] } | null>(
    null,
  );
  const toolsAbortRef = useRef<AbortController | null>(null);

  const [reqText, setReqText] = useState(
    "为研发团队做一个内部 Agent 平台：支持知识库问答、需求拆解、技术方案草稿与工具调用，需有基础权限与审计日志。",
  );
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError] = useState("");
  const [reqResult, setReqResult] = useState<RequirementsAnalyzeResponse | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !isStreaming, [input, isStreaming]);
  const canAnalyze = useMemo(() => reqText.trim().length > 0 && !reqLoading, [reqText, reqLoading]);
  const canSendTools = useMemo(
    () => toolsInput.trim().length > 0 && !toolsStreaming,
    [toolsInput, toolsStreaming],
  );

  const runChatStream = useCallback(
    async (apiMessages: ApiChatMessage[], assistantId: string, signal: AbortSignal) => {
      const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
        signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`请求失败：${response.status}`);
      }
      await readSseStream(response.body, (eventData) => {
        if (eventData.type === "meta") {
          setRuntimeMode(eventData.mocked ? "mock" : "provider");
          setModelName((prev) => eventData.model ?? prev);
          return;
        }
        if (eventData.type === "done") {
          return;
        }
        if (eventData.type === "delta") {
          setMessages((currentMessages) =>
            currentMessages.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + (eventData.content ?? "") }
                : message,
            ),
          );
        }
      });
    },
    [],
  );

  const runToolsStream = useCallback(
    async (apiMessages: ApiChatMessage[], assistantId: string, signal: AbortSignal) => {
      const response = await fetch(`${API_BASE_URL}/api/chat/stream-tools`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
        signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`请求失败：${response.status}`);
      }

      await readSseStream(response.body, (eventData) => {
        if (eventData.type === "meta") {
          setRuntimeMode(eventData.mocked ? "mock" : "provider");
          setModelName((prev) => eventData.model ?? prev);
          return;
        }
        if (eventData.type === "done") {
          return;
        }
        if (eventData.type === "delta") {
          setToolsMessages((current) =>
            current.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + (eventData.content ?? "") } : m,
            ),
          );
          return;
        }
        if (eventData.type === "tool_call") {
          setToolsMessages((current) =>
            current.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    toolTrace: [
                      ...m.toolTrace,
                      {
                        toolCallId: eventData.tool_call_id,
                        name: eventData.name,
                        arguments: eventData.arguments,
                        phase: "running",
                      },
                    ],
                  }
                : m,
            ),
          );
          return;
        }
        if (eventData.type === "tool_result") {
          setToolsMessages((current) =>
            current.map((m) => {
              if (m.id !== assistantId) {
                return m;
              }
              const tid = eventData.tool_call_id;
              const idx = m.toolTrace.findIndex((t) => t.toolCallId === tid);
              if (idx >= 0) {
                const trace = [...m.toolTrace];
                trace[idx] = {
                  ...trace[idx],
                  result: eventData.content,
                  ok: eventData.ok,
                  phase: "done",
                };
                return { ...m, toolTrace: trace };
              }
              return {
                ...m,
                toolTrace: [
                  ...m.toolTrace,
                  {
                    toolCallId: tid,
                    name: eventData.name,
                    result: eventData.content,
                    ok: eventData.ok,
                    phase: "done",
                  },
                ],
              };
            }),
          );
        }
      });
    },
    [],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const prompt = input.trim();
    if (!prompt || isStreaming) {
      return;
    }

    setError("");
    setInput("");
    setIsStreaming(true);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
    };
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };

    const nextMessages = [...messages, userMessage, assistantMessage];
    setMessages(nextMessages);

    const apiMessages: ApiChatMessage[] = nextMessages
      .filter((message) => message.content.trim())
      .map((message) => ({ role: message.role, content: message.content }));
    setChatRetry({ assistantId: assistantMessage.id, apiMessages });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await runChatStream(apiMessages, assistantMessage.id, controller.signal);
      setChatRetry(null);
    } catch (caughtError) {
      const err = caughtError as Error;
      if (err.name === "AbortError") {
        setChatRetry(null);
        return;
      }
      setError(err.message || "请求出现异常");
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }

  async function retryChat() {
    if (!chatRetry || isStreaming) {
      return;
    }
    setError("");
    setIsStreaming(true);
    const { assistantId, apiMessages } = chatRetry;
    setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: "" } : m)));

    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      await runChatStream(apiMessages, assistantId, controller.signal);
      setChatRetry(null);
    } catch (caughtError) {
      const err = caughtError as Error;
      if (err.name === "AbortError") {
        setChatRetry(null);
        return;
      }
      setError(err.message || "请求出现异常");
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }

  async function handleAnalyzeRequirements(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = reqText.trim();
    if (!text || reqLoading) {
      return;
    }
    setReqError("");
    setReqLoading(true);
    setReqResult(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/requirements/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: text }),
      });
      const payload = (await response.json()) as RequirementsAnalyzeResponse & { detail?: unknown };
      if (!response.ok) {
        const detail =
          typeof payload.detail === "string"
            ? payload.detail
            : Array.isArray(payload.detail)
              ? payload.detail.map((d) => JSON.stringify(d)).join("；")
              : `HTTP ${response.status}`;
        throw new Error(detail);
      }
      setReqResult(payload);
      setModelName(payload.model);
      setRuntimeMode(payload.mocked ? "mock" : "provider");
    } catch (caughtError) {
      setReqError((caughtError as Error).message || "分析请求失败");
    } finally {
      setReqLoading(false);
    }
  }

  function stopStreaming() {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  }

  async function handleToolsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = toolsInput.trim();
    if (!prompt || toolsStreaming) {
      return;
    }

    setToolsError("");
    setToolsInput("");
    setToolsStreaming(true);

    const userMessage: ToolsChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
      toolTrace: [],
    };
    const assistantMessage: ToolsChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      toolTrace: [],
    };
    const nextMessages = [...toolsMessages, userMessage, assistantMessage];
    setToolsMessages(nextMessages);

    const apiMessages: ApiChatMessage[] = nextMessages
      .filter((m) => m.content.trim())
      .map((m) => ({ role: m.role, content: m.content }));
    setToolsRetry({ assistantId: assistantMessage.id, apiMessages });

    const controller = new AbortController();
    toolsAbortRef.current = controller;

    try {
      await runToolsStream(apiMessages, assistantMessage.id, controller.signal);
      setToolsRetry(null);
    } catch (caughtError) {
      const err = caughtError as Error;
      if (err.name === "AbortError") {
        setToolsRetry(null);
        return;
      }
      setToolsError(err.message || "请求出现异常");
    } finally {
      setToolsStreaming(false);
      toolsAbortRef.current = null;
    }
  }

  async function retryTools() {
    if (!toolsRetry || toolsStreaming) {
      return;
    }
    setToolsError("");
    setToolsStreaming(true);
    const { assistantId, apiMessages } = toolsRetry;
    setToolsMessages((prev) =>
      prev.map((m) => (m.id === assistantId ? { ...m, content: "", toolTrace: [] } : m)),
    );

    const controller = new AbortController();
    toolsAbortRef.current = controller;
    try {
      await runToolsStream(apiMessages, assistantId, controller.signal);
      setToolsRetry(null);
    } catch (caughtError) {
      const err = caughtError as Error;
      if (err.name === "AbortError") {
        setToolsRetry(null);
        return;
      }
      setToolsError(err.message || "请求出现异常");
    } finally {
      setToolsStreaming(false);
      toolsAbortRef.current = null;
    }
  }

  function stopToolsStreaming() {
    toolsAbortRef.current?.abort();
    setToolsStreaming(false);
  }

  return (
    <main className="min-h-screen bg-[#f6f7f4] text-[#1f2520]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-4 py-5 lg:grid lg:grid-cols-[320px_1fr] lg:px-6">
        <aside className="flex flex-col gap-4 rounded-lg border border-[#dfe3d8] bg-white p-5 shadow-sm">
          <div>
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#205f4f] text-white">
              <Sparkles size={22} aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-2xl font-semibold leading-tight">AgentFlow AI</h1>
            <p className="mt-2 text-sm leading-6 text-[#627064]">
              面向求职项目的 AI Agent 应用开发训练营。第 1 周串联 Day 3（结构化输出）、Day 4（Tool Calling）与 Day
              5（Chat 产品体验），围绕同一主项目持续迭代。
            </p>
          </div>

          <section className="rounded-md border border-[#e4e7dd] bg-[#fbfcf8] p-4">
            <h2 className="text-sm font-semibold">Day 3 目标</h2>
            <div className="mt-3 space-y-3">
              {dayThreeGoals.map((goal) => (
                <div className="flex items-start gap-2 text-sm text-[#455047]" key={goal}>
                  <CheckCircle2 className="mt-0.5 shrink-0 text-[#27715e]" size={16} aria-hidden="true" />
                  <span>{goal}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-[#e4e7dd] bg-[#fbfcf8] p-4">
            <h2 className="text-sm font-semibold">Day 4 目标</h2>
            <div className="mt-3 space-y-3">
              {dayFourGoals.map((goal) => (
                <div className="flex items-start gap-2 text-sm text-[#455047]" key={goal}>
                  <CheckCircle2 className="mt-0.5 shrink-0 text-[#2a6b8f]" size={16} aria-hidden="true" />
                  <span>{goal}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-[#e4e7dd] bg-[#fbfcf8] p-4">
            <h2 className="text-sm font-semibold">Day 5 目标</h2>
            <div className="mt-3 space-y-3">
              {dayFiveGoals.map((goal) => (
                <div className="flex items-start gap-2 text-sm text-[#455047]" key={goal}>
                  <CheckCircle2 className="mt-0.5 shrink-0 text-[#6b4a9a]" size={16} aria-hidden="true" />
                  <span>{goal}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-[#e4e7dd] bg-[#fbfcf8] p-4">
            <h2 className="text-sm font-semibold">本地服务</h2>
            <dl className="mt-3 space-y-2 text-sm text-[#455047]">
              <div className="flex justify-between gap-3">
                <dt>Frontend</dt>
                <dd className="font-mono">:3000</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>FastAPI</dt>
                <dd className="font-mono">:8000</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Mode</dt>
                <dd className="font-mono">{runtimeMode}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Model</dt>
                <dd className="max-w-32 truncate font-mono">{modelName}</dd>
              </div>
            </dl>
          </section>
        </aside>

        <section className="flex min-h-[720px] flex-col overflow-hidden rounded-lg border border-[#dfe3d8] bg-white shadow-sm">
          <header className="border-b border-[#e4e7dd] px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm text-[#627064]">AI Application Workspace</p>
                <h2 className="text-xl font-semibold">
                  {workspace === "requirements"
                    ? "Day 3 · Prompt 与结构化输出"
                    : workspace === "tools"
                      ? "Day 4 · Tool Calling"
                      : "Day 5 · Chat 体验"}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition ${
                    workspace === "requirements"
                      ? "border-[#205f4f] bg-[#e4efe8] text-[#17483c]"
                      : "border-[#dfe3d8] text-[#455047] hover:bg-[#f2f4ef]"
                  }`}
                  onClick={() => setWorkspace("requirements")}
                  type="button"
                >
                  <ClipboardList size={16} aria-hidden="true" />
                  需求分析
                </button>
                <button
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition ${
                    workspace === "tools"
                      ? "border-[#205f4f] bg-[#e4efe8] text-[#17483c]"
                      : "border-[#dfe3d8] text-[#455047] hover:bg-[#f2f4ef]"
                  }`}
                  onClick={() => setWorkspace("tools")}
                  type="button"
                >
                  <Wrench size={16} aria-hidden="true" />
                  工具调用
                </button>
                <button
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition ${
                    workspace === "chat"
                      ? "border-[#205f4f] bg-[#e4efe8] text-[#17483c]"
                      : "border-[#dfe3d8] text-[#455047] hover:bg-[#f2f4ef]"
                  }`}
                  onClick={() => setWorkspace("chat")}
                  type="button"
                >
                  <MessageSquare size={16} aria-hidden="true" />
                  Chat 体验
                </button>
              </div>
            </div>
          </header>

          {workspace === "requirements" ? (
            <div className="flex flex-1 flex-col overflow-hidden bg-[#fbfcf8]">
              <div className="flex-1 space-y-5 overflow-y-auto p-5">
                <p className="text-sm leading-6 text-[#627064]">
                  调用 <span className="font-mono text-[#273029]">POST /api/requirements/analyze</span>
                  ，后端用 system prompt 约束 JSON 形状，再用 Pydantic 校验；无 API Key 时返回可校验的 mock 数据。
                </p>

                {reqResult ? (
                  <div className="space-y-4">
                    <StructuredBlock title="需求摘要" tone="summary">
                      <p className="whitespace-pre-wrap text-sm leading-6 text-[#273029]">
                        {reqResult.analysis.summary}
                      </p>
                    </StructuredBlock>
                    <StructuredBlock title="用户故事" tone="stories">
                      <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-[#273029]">
                        {reqResult.analysis.user_stories.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </StructuredBlock>
                    <StructuredBlock title="验收标准" tone="criteria">
                      <ul className="list-decimal space-y-2 pl-5 text-sm leading-6 text-[#273029]">
                        {reqResult.analysis.acceptance_criteria.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </StructuredBlock>
                    <StructuredBlock title="风险点" tone="risks">
                      {reqResult.analysis.risks.length ? (
                        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-[#273029]">
                          {reqResult.analysis.risks.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-[#627064]">（模型未列出额外风险）</p>
                      )}
                    </StructuredBlock>
                    <p className="text-xs text-[#8a9589]">
                      模型：{reqResult.model} · {reqResult.mocked ? "mock 占位" : "供应商输出已校验"}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-[#cfd6ca] bg-white px-4 py-8 text-center text-sm text-[#627064]">
                    在下方粘贴需求描述并点击「分析」，结构化结果会出现在这里。
                  </div>
                )}
              </div>

              <div className="border-t border-[#e4e7dd] bg-white p-4">
                {reqError ? (
                  <div className="mb-3 rounded-md border border-[#efc6be] bg-[#fff4f1] px-3 py-2 text-sm text-[#9b3323]">
                    {reqError}
                  </div>
                ) : null}
                <form className="flex flex-col gap-3 md:flex-row" onSubmit={handleAnalyzeRequirements}>
                  <textarea
                    className="min-h-28 flex-1 resize-none rounded-md border border-[#cfd6ca] bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-[#27715e] focus:ring-2 focus:ring-[#27715e]/15"
                    onChange={(event) => setReqText(event.target.value)}
                    placeholder="输入一段产品 / 研发需求描述…"
                    value={reqText}
                  />
                  <div className="flex gap-2 md:w-36 md:flex-col">
                    <button
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-[#205f4f] px-4 text-sm font-medium text-white transition hover:bg-[#17483c] disabled:cursor-not-allowed disabled:bg-[#9daaa1] md:flex-none"
                      disabled={!canAnalyze}
                      type="submit"
                    >
                      {reqLoading ? <Loader2 className="animate-spin" size={17} /> : <ClipboardList size={17} />}
                      分析
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : workspace === "tools" ? (
            <>
              <div className="flex flex-1 flex-col overflow-hidden bg-[#fbfcf8]">
                <div className="flex-1 space-y-4 overflow-y-auto p-5">
                  <p className="text-sm leading-6 text-[#627064]">
                    调用{" "}
                    <span className="font-mono text-[#273029]">POST /api/chat/stream-tools</span>
                    ，SSE 中可穿插 <span className="font-mono">tool_call</span> /{" "}
                    <span className="font-mono">tool_result</span>
                    。无 API Key 时由后端 mock 演示三路工具。
                  </p>
                  {toolsMessages.map((message, index) => {
                    const isLastAssistant =
                      message.role === "assistant" && index === toolsMessages.length - 1;
                    return (
                      <article
                        className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                        key={message.id}
                      >
                        {message.role === "assistant" ? (
                          <MessageAvatar role={message.role} />
                        ) : null}
                        <div
                          className={`max-w-[780px] rounded-lg border px-4 py-3 text-sm leading-6 shadow-sm ${
                            message.role === "user"
                              ? "border-[#1f5c4d] bg-[#205f4f] text-white"
                              : "border-[#e2e6dc] bg-white text-[#273029]"
                          }`}
                        >
                          {message.role === "assistant" && message.toolTrace.length > 0 ? (
                            <ToolTraceList trace={message.toolTrace} />
                          ) : null}
                          {message.content.trim() ? (
                            message.role === "assistant" ? (
                              <AssistantMarkdown content={message.content} />
                            ) : (
                              <div className="whitespace-pre-wrap">{message.content}</div>
                            )
                          ) : message.role === "assistant" && toolsStreaming && isLastAssistant ? (
                            <span className="inline-flex items-center gap-2 text-[#627064]">
                              <Loader2 className="animate-spin" size={15} aria-hidden="true" />
                              {message.toolTrace.some((t) => t.phase === "running")
                                ? "正在执行工具…"
                                : "等待模型回复…"}
                            </span>
                          ) : message.role === "assistant" ? (
                            <span className="text-xs text-[#8a9589]">（本条暂无正文）</span>
                          ) : (
                            <div className="whitespace-pre-wrap">{message.content}</div>
                          )}
                        </div>
                        {message.role === "user" ? <MessageAvatar role={message.role} /> : null}
                      </article>
                    );
                  })}
                </div>

                <div className="border-t border-[#e4e7dd] bg-white p-4">
                  {toolsError ? (
                    <div className="mb-3 flex flex-col gap-2 rounded-md border border-[#efc6be] bg-[#fff4f1] px-3 py-2 text-sm text-[#9b3323] sm:flex-row sm:items-center sm:justify-between">
                      <span className="min-w-0 flex-1">{toolsError}</span>
                      {toolsRetry ? (
                        <button
                          className="inline-flex shrink-0 items-center justify-center gap-1.5 self-start rounded-md border border-[#d4a39c] bg-white px-3 py-1.5 text-xs font-medium text-[#7a2e22] transition hover:bg-[#fff8f6] disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
                          disabled={toolsStreaming}
                          onClick={retryTools}
                          type="button"
                        >
                          <RotateCcw size={14} aria-hidden />
                          重试
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <form className="flex flex-col gap-3 md:flex-row" onSubmit={handleToolsSubmit}>
                    <textarea
                      className="min-h-24 flex-1 resize-none rounded-md border border-[#cfd6ca] bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-[#27715e] focus:ring-2 focus:ring-[#27715e]/15"
                      onChange={(event) => setToolsInput(event.target.value)}
                      placeholder="描述任务：可要求文档检索、任务计划、FastAPI 草稿等…"
                      value={toolsInput}
                    />
                    <div className="flex gap-2 md:w-32 md:flex-col">
                      <button
                        className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-[#205f4f] px-4 text-sm font-medium text-white transition hover:bg-[#17483c] disabled:cursor-not-allowed disabled:bg-[#9daaa1] md:flex-none"
                        disabled={!canSendTools}
                        type="submit"
                      >
                        {toolsStreaming ? <Loader2 className="animate-spin" size={17} /> : <Wrench size={17} />}
                        发送
                      </button>
                      <button
                        className="h-11 flex-1 rounded-md border border-[#cfd6ca] px-4 text-sm font-medium text-[#455047] transition hover:bg-[#f2f4ef] disabled:cursor-not-allowed disabled:text-[#9daaa1] md:flex-none"
                        disabled={!toolsStreaming}
                        onClick={stopToolsStreaming}
                        type="button"
                      >
                        停止
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex-1 space-y-4 overflow-y-auto bg-[#fbfcf8] p-5">
                {messages.map((message, index) => {
                  const isLast = index === messages.length - 1;
                  const showChatSpinner =
                    message.role === "assistant" &&
                    isLast &&
                    isStreaming &&
                    !message.content.trim();

                  return (
                    <article
                      className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                      key={message.id}
                    >
                      {message.role === "assistant" ? (
                        <MessageAvatar role={message.role} />
                      ) : null}
                      <div
                        className={`max-w-[780px] rounded-lg border px-4 py-3 text-sm leading-6 shadow-sm ${
                          message.role === "user"
                            ? "border-[#1f5c4d] bg-[#205f4f] text-white"
                            : "border-[#e2e6dc] bg-white text-[#273029]"
                        }`}
                      >
                        {message.role === "assistant" ? (
                          message.content.trim() ? (
                            <AssistantMarkdown content={message.content} />
                          ) : showChatSpinner ? (
                            <span className="inline-flex items-center gap-2 text-[#627064]">
                              <Loader2 className="animate-spin" size={15} aria-hidden="true" />
                              正在生成
                            </span>
                          ) : (
                            <span className="text-xs text-[#8a9589]">（本条暂无正文）</span>
                          )
                        ) : (
                          <div className="whitespace-pre-wrap">{message.content}</div>
                        )}
                      </div>
                      {message.role === "user" ? <MessageAvatar role={message.role} /> : null}
                    </article>
                  );
                })}
              </div>

              <div className="border-t border-[#e4e7dd] bg-white p-4">
                {error ? (
                  <div className="mb-3 flex flex-col gap-2 rounded-md border border-[#efc6be] bg-[#fff4f1] px-3 py-2 text-sm text-[#9b3323] sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0 flex-1">{error}</span>
                    {chatRetry ? (
                      <button
                        className="inline-flex shrink-0 items-center justify-center gap-1.5 self-start rounded-md border border-[#d4a39c] bg-white px-3 py-1.5 text-xs font-medium text-[#7a2e22] transition hover:bg-[#fff8f6] disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
                        disabled={isStreaming}
                        onClick={retryChat}
                        type="button"
                      >
                        <RotateCcw size={14} aria-hidden />
                        重试
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <form className="flex flex-col gap-3 md:flex-row" onSubmit={handleSubmit}>
                  <textarea
                    className="min-h-24 flex-1 resize-none rounded-md border border-[#cfd6ca] bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-[#27715e] focus:ring-2 focus:ring-[#27715e]/15"
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="输入一个问题，验证前后端流式响应…"
                    value={input}
                  />
                  <div className="flex gap-2 md:w-32 md:flex-col">
                    <button
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-[#205f4f] px-4 text-sm font-medium text-white transition hover:bg-[#17483c] disabled:cursor-not-allowed disabled:bg-[#9daaa1] md:flex-none"
                      disabled={!canSend}
                      type="submit"
                    >
                      {isStreaming ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />}
                      发送
                    </button>
                    <button
                      className="h-11 flex-1 rounded-md border border-[#cfd6ca] px-4 text-sm font-medium text-[#455047] transition hover:bg-[#f2f4ef] disabled:cursor-not-allowed disabled:text-[#9daaa1] md:flex-none"
                      disabled={!isStreaming}
                      onClick={stopStreaming}
                      type="button"
                    >
                      停止
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function ToolTraceList({ trace }: { trace: ToolTraceItem[] }) {
  return (
    <div className="mb-3 space-y-2">
      {trace.map((item, index) => (
        <div
          key={`${item.toolCallId ?? "call"}-${index}-${item.name}`}
          className="rounded-md border border-[#d8ded0] bg-[#f4f7f0] px-3 py-2 text-left"
        >
          <div className="flex items-center justify-between gap-2 text-xs text-[#273029]">
            <span className="font-semibold">{item.name}</span>
            {item.phase === "running" ? (
              <Loader2 className="animate-spin text-[#27715e]" size={14} aria-hidden="true" />
            ) : item.ok === false ? (
              <span className="text-[#9b3323]">失败</span>
            ) : (
              <span className="text-[#27715e]">完成</span>
            )}
          </div>
          {item.arguments && Object.keys(item.arguments).length > 0 ? (
            <pre className="mt-2 max-h-28 overflow-auto text-[11px] leading-4 text-[#455047]">
              {JSON.stringify(item.arguments, null, 2)}
            </pre>
          ) : null}
          {item.result !== undefined ? (
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-4 text-[#455047]">
              {item.result}
            </pre>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function StructuredBlock({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "summary" | "stories" | "criteria" | "risks";
  children: ReactNode;
}) {
  const bar =
    tone === "summary"
      ? "bg-[#205f4f]"
      : tone === "stories"
        ? "bg-[#2a6b8f]"
        : tone === "criteria"
          ? "bg-[#6b5a2a]"
          : "bg-[#8a3d3d]";

  return (
    <section className="rounded-lg border border-[#e2e6dc] bg-white shadow-sm">
      <div className={`h-1 w-full rounded-t-lg ${bar}`} />
      <div className="px-4 py-3">
        <h3 className="text-sm font-semibold text-[#1f2520]">{title}</h3>
        <div className="mt-3">{children}</div>
      </div>
    </section>
  );
}

function MessageAvatar({ role }: { role: Role }) {
  const isAssistant = role === "assistant";

  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
        isAssistant ? "bg-[#e4efe8] text-[#205f4f]" : "bg-[#edf0e8] text-[#455047]"
      }`}
    >
      {isAssistant ? <Bot size={18} aria-hidden="true" /> : <User size={18} aria-hidden="true" />}
    </div>
  );
}

async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (eventData: StreamEvent) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const eventText of events) {
      const dataLine = eventText
        .split("\n")
        .find((line) => line.startsWith("data: "));

      if (!dataLine) {
        continue;
      }

      const jsonText = dataLine.replace(/^data:\s*/, "");
      onEvent(JSON.parse(jsonText) as StreamEvent);
    }
  }
}
