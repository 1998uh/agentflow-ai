"use client";

import { type ReactNode, FormEvent, useMemo, useRef, useState } from "react";
import {
  Bot,
  CheckCircle2,
  ClipboardList,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  User,
} from "lucide-react";

type Role = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: Role;
  content: string;
};

type StreamEvent = {
  type: "meta" | "delta" | "done";
  content?: string;
  mocked?: boolean;
  model?: string;
};

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
      "你好，我是 AgentFlow AI。Day 3 我们在 system / user 分层 Prompt 之上，用 Pydantic 校验模型返回的 JSON。",
  },
];

const dayThreeGoals = [
  "后端：system prompt 约束只输出 JSON",
  "POST /api/requirements/analyze + Pydantic 模型",
  "解析失败时自动发起一次「修复 JSON」重试",
  "前端分区展示摘要、用户故事、验收标准、风险",
];

export default function Home() {
  const [workspace, setWorkspace] = useState<"chat" | "requirements">("requirements");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("用三句话解释：为什么结构化输出要在服务端做校验？");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const [runtimeMode, setRuntimeMode] = useState("unknown");
  const [modelName, setModelName] = useState("gpt-4.1-mini");
  const abortControllerRef = useRef<AbortController | null>(null);

  const [reqText, setReqText] = useState(
    "为研发团队做一个内部 Agent 平台：支持知识库问答、需求拆解、技术方案草稿与工具调用，需有基础权限与审计日志。",
  );
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError] = useState("");
  const [reqResult, setReqResult] = useState<RequirementsAnalyzeResponse | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !isStreaming, [input, isStreaming]);
  const canAnalyze = useMemo(() => reqText.trim().length > 0 && !reqLoading, [reqText, reqLoading]);

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

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages
            .filter((message) => message.content.trim())
            .map((message) => ({
              role: message.role,
              content: message.content,
            })),
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`请求失败：${response.status}`);
      }

      await readSseStream(response.body, (eventData) => {
        if (eventData.type === "meta") {
          setRuntimeMode(eventData.mocked ? "mock" : "provider");
          setModelName(eventData.model ?? modelName);
          return;
        }

        if (eventData.type === "done") {
          return;
        }

        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: message.content + (eventData.content ?? "") }
              : message,
          ),
        );
      });
    } catch (caughtError) {
      if ((caughtError as Error).name !== "AbortError") {
        setError((caughtError as Error).message || "请求出现异常");
      }
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
              面向求职项目的 AI Agent 应用开发训练营。今天聚焦 Prompt 分层与结构化 JSON + Pydantic 校验。
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
                <h2 className="text-xl font-semibold">Day 3 · Prompt 与结构化输出</h2>
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
                    workspace === "chat"
                      ? "border-[#205f4f] bg-[#e4efe8] text-[#17483c]"
                      : "border-[#dfe3d8] text-[#455047] hover:bg-[#f2f4ef]"
                  }`}
                  onClick={() => setWorkspace("chat")}
                  type="button"
                >
                  <MessageSquare size={16} aria-hidden="true" />
                  SSE 聊天
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
          ) : (
            <>
              <div className="flex-1 space-y-4 overflow-y-auto bg-[#fbfcf8] p-5">
                {messages.map((message) => (
                  <article
                    className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    key={message.id}
                  >
                    {message.role === "assistant" ? (
                      <MessageAvatar role={message.role} />
                    ) : null}
                    <div
                      className={`max-w-[780px] whitespace-pre-wrap rounded-lg border px-4 py-3 text-sm leading-6 shadow-sm ${
                        message.role === "user"
                          ? "border-[#1f5c4d] bg-[#205f4f] text-white"
                          : "border-[#e2e6dc] bg-white text-[#273029]"
                      }`}
                    >
                      {message.content || (
                        <span className="inline-flex items-center gap-2 text-[#627064]">
                          <Loader2 className="animate-spin" size={15} aria-hidden="true" />
                          正在生成
                        </span>
                      )}
                    </div>
                    {message.role === "user" ? <MessageAvatar role={message.role} /> : null}
                  </article>
                ))}
              </div>

              <div className="border-t border-[#e4e7dd] bg-white p-4">
                {error ? (
                  <div className="mb-3 rounded-md border border-[#efc6be] bg-[#fff4f1] px-3 py-2 text-sm text-[#9b3323]">
                    {error}
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
