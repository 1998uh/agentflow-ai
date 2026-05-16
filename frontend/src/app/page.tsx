"use client";

import { type ReactNode, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  CheckCircle2,
  ClipboardList,
  History,
  Loader2,
  MessageSquare,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  User,
  Wrench,
} from "lucide-react";

import { AssistantMarkdown } from "@/components/chat/AssistantMarkdown";

type Role = "user" | "assistant" | "system";

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

type ToolsChatMessage = ChatMessage & {
  toolTrace: ToolTraceItem[];
};

type StreamEvent =
  | { type: "meta"; content?: string; mocked?: boolean; model?: string }
  | { type: "delta"; content?: string }
  | { type: "tool_call"; tool_call_id?: string; name: string; arguments?: Record<string, unknown> }
  | { type: "tool_result"; tool_call_id?: string; name: string; content?: string; ok?: boolean }
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

type ChatCompletionResponse = {
  content: string;
  model: string;
  mocked: boolean;
  session_id?: string | null;
};

type ChatSessionSummary = {
  id: string;
  title?: string | null;
  updated_at?: string | null;
  message_count: number;
};

type ChatSessionsResponse = {
  sessions: ChatSessionSummary[];
};

type ApiChatMessage = {
  role: Role;
  content: string;
};

type ChatHistoryResponse = {
  session_id: string;
  messages: ApiChatMessage[];
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "你好，我是 **AgentFlow AI**。Day 6 已接入数据库会话存储：你可以新建会话、继续历史对话，也可以刷新后再加载历史记录。",
  },
];

const initialToolsMessages: ToolsChatMessage[] = [
  {
    id: "welcome-tools",
    role: "assistant",
    content:
      "这里是 Tool Calling 工作区。可以让我检索项目文档、拆解任务计划，或者生成 FastAPI 接口草稿。",
    toolTrace: [],
  },
];

const dayThreeGoals = [
  "后端用 system prompt 约束模型输出 JSON",
  "POST /api/requirements/analyze + Pydantic 校验",
  "解析失败时发起一次 JSON 修复重试",
  "前端分区展示摘要、用户故事、验收标准、风险",
];

const dayFourGoals = [
  "本地工具：search_project_docs / create_task_plan / generate_api_mock",
  "模型 tool_calls -> 后端执行工具 -> 工具结果写回上下文",
  "POST /api/chat/stream-tools 通过 SSE 返回 tool_call、tool_result、delta",
  "前端展示工具参数、执行状态与返回摘要",
];

const dayFiveGoals = [
  "Chat 支持 Markdown 渲染与代码块展示",
  "fetch + AbortController 处理流式响应和停止",
  "失败后保留重试入口",
  "模型、mock/provider 状态在 UI 中可见",
];

const daySixGoals = [
  "普通 Chat 使用 session_id + message 协议",
  "后端从 SQLite 读取历史并拼回模型上下文",
  "前端可新建会话、加载历史会话",
  "Tool Calling 保留独立 SSE 演示，不混入普通聊天历史",
];

export default function Home() {
  const [workspace, setWorkspace] = useState<"chat" | "requirements" | "tools">("chat");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("继续解释一下：session_id 在后端流程里起什么作用？");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [chatRetry, setChatRetry] = useState<{ assistantId: string; prompt: string; sessionId: string | null } | null>(
    null,
  );
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatSessions, setChatSessions] = useState<ChatSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [runtimeMode, setRuntimeMode] = useState("unknown");
  const [modelName, setModelName] = useState("deepseek-chat");

  const [toolsMessages, setToolsMessages] = useState<ToolsChatMessage[]>(initialToolsMessages);
  const [toolsInput, setToolsInput] = useState(
    "先检索项目文档总结 SSE，再给一个 3 阶段任务计划。",
  );
  const [toolsStreaming, setToolsStreaming] = useState(false);
  const [toolsError, setToolsError] = useState("");
  const [toolsRetry, setToolsRetry] = useState<{ assistantId: string; apiMessages: ApiChatMessage[] } | null>(
    null,
  );
  const toolsAbortRef = useRef<AbortController | null>(null);

  const [reqText, setReqText] = useState(
    "为研发团队做一个内部 Agent 平台：支持知识库问答、需求拆解、技术方案草稿与工具调用，需要基础权限与审计日志。",
  );
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError] = useState("");
  const [reqResult, setReqResult] = useState<RequirementsAnalyzeResponse | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);
  const canAnalyze = useMemo(() => reqText.trim().length > 0 && !reqLoading, [reqText, reqLoading]);
  const canSendTools = useMemo(
    () => toolsInput.trim().length > 0 && !toolsStreaming,
    [toolsInput, toolsStreaming],
  );

  const refreshChatSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/sessions`);
      if (!response.ok) {
        throw new Error(`加载会话失败：${response.status}`);
      }
      const payload = (await response.json()) as ChatSessionsResponse;
      setChatSessions(payload.sessions);
    } catch (caughtError) {
      setError((caughtError as Error).message || "加载会话失败");
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshChatSessions();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshChatSessions]);

  const runChatCompletion = useCallback(
    async (prompt: string, sessionId: string | null, assistantId: string) => {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, session_id: sessionId }),
      });
      const payload = (await response.json()) as ChatCompletionResponse & { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? `请求失败：${response.status}`);
      }
      setRuntimeMode(payload.mocked ? "mock" : "provider");
      setModelName(payload.model);
      setChatSessionId(payload.session_id ?? sessionId);
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId ? { ...message, content: payload.content } : message,
        ),
      );
      await refreshChatSessions();
    },
    [refreshChatSessions],
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
            current.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + (eventData.content ?? "") }
                : message,
            ),
          );
          return;
        }
        if (eventData.type === "tool_call") {
          setToolsMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    toolTrace: [
                      ...message.toolTrace,
                      {
                        toolCallId: eventData.tool_call_id,
                        name: eventData.name,
                        arguments: eventData.arguments,
                        phase: "running",
                      },
                    ],
                  }
                : message,
            ),
          );
          return;
        }
        if (eventData.type === "tool_result") {
          setToolsMessages((current) =>
            current.map((message) => {
              if (message.id !== assistantId) {
                return message;
              }
              const index = message.toolTrace.findIndex((item) => item.toolCallId === eventData.tool_call_id);
              if (index >= 0) {
                const toolTrace = [...message.toolTrace];
                toolTrace[index] = {
                  ...toolTrace[index],
                  result: eventData.content,
                  ok: eventData.ok,
                  phase: "done",
                };
                return { ...message, toolTrace };
              }
              return {
                ...message,
                toolTrace: [
                  ...message.toolTrace,
                  {
                    toolCallId: eventData.tool_call_id,
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
    if (!prompt || isSending) {
      return;
    }

    setError("");
    setInput("");
    setIsSending(true);

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: prompt };
    const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "" };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setChatRetry({ assistantId: assistantMessage.id, prompt, sessionId: chatSessionId });

    try {
      await runChatCompletion(prompt, chatSessionId, assistantMessage.id);
      setChatRetry(null);
    } catch (caughtError) {
      setError((caughtError as Error).message || "请求出现异常");
    } finally {
      setIsSending(false);
    }
  }

  async function retryChat() {
    if (!chatRetry || isSending) {
      return;
    }
    setError("");
    setIsSending(true);
    const { assistantId, prompt, sessionId } = chatRetry;
    setMessages((current) =>
      current.map((message) => (message.id === assistantId ? { ...message, content: "" } : message)),
    );

    try {
      await runChatCompletion(prompt, sessionId, assistantId);
      setChatRetry(null);
    } catch (caughtError) {
      setError((caughtError as Error).message || "请求出现异常");
    } finally {
      setIsSending(false);
    }
  }

  function startNewChat() {
    setChatSessionId(null);
    setMessages(initialMessages);
    setChatRetry(null);
    setError("");
    setWorkspace("chat");
  }

  async function loadChatHistory(sessionId: string) {
    if (historyLoading || isSending) {
      return;
    }
    setError("");
    setHistoryLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/sessions/${sessionId}`);
      if (!response.ok) {
        throw new Error(`加载历史失败：${response.status}`);
      }
      const payload = (await response.json()) as ChatHistoryResponse;
      setChatSessionId(payload.session_id);
      setMessages(payload.messages.length ? payload.messages.map(toUiChatMessage) : initialMessages);
      setChatRetry(null);
      setWorkspace("chat");
    } catch (caughtError) {
      setError((caughtError as Error).message || "加载历史失败");
    } finally {
      setHistoryLoading(false);
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
        throw new Error(typeof payload.detail === "string" ? payload.detail : `HTTP ${response.status}`);
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

    const apiMessages = nextMessages
      .filter((message) => message.content.trim())
      .map((message) => ({ role: message.role, content: message.content }));
    setToolsRetry({ assistantId: assistantMessage.id, apiMessages });

    const controller = new AbortController();
    toolsAbortRef.current = controller;
    try {
      await runToolsStream(apiMessages, assistantMessage.id, controller.signal);
      setToolsRetry(null);
    } catch (caughtError) {
      const err = caughtError as Error;
      if (err.name !== "AbortError") {
        setToolsError(err.message || "请求出现异常");
      }
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
    setToolsMessages((current) =>
      current.map((message) =>
        message.id === assistantId ? { ...message, content: "", toolTrace: [] } : message,
      ),
    );

    const controller = new AbortController();
    toolsAbortRef.current = controller;
    try {
      await runToolsStream(apiMessages, assistantId, controller.signal);
      setToolsRetry(null);
    } catch (caughtError) {
      const err = caughtError as Error;
      if (err.name !== "AbortError") {
        setToolsError(err.message || "请求出现异常");
      }
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
              面向 AI Agent 应用后端训练：结构化输出、工具调用、产品化 Chat 与数据库会话存储。
            </p>
          </div>

          <GoalBlock title="Day 3 目标" goals={dayThreeGoals} tone="green" />
          <GoalBlock title="Day 4 目标" goals={dayFourGoals} tone="blue" />
          <GoalBlock title="Day 5 目标" goals={dayFiveGoals} tone="purple" />
          <GoalBlock title="Day 6 目标" goals={daySixGoals} tone="brown" />

          <section className="rounded-md border border-[#e4e7dd] bg-[#fbfcf8] p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">会话历史</h2>
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#cfd6ca] bg-white text-[#455047] transition hover:bg-[#f2f4ef]"
                onClick={startNewChat}
                title="新建会话"
                type="button"
              >
                <Plus size={15} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
              {sessionsLoading ? (
                <div className="flex items-center gap-2 text-sm text-[#627064]">
                  <Loader2 className="animate-spin" size={15} aria-hidden="true" />
                  加载中
                </div>
              ) : chatSessions.length ? (
                chatSessions.map((session) => (
                  <button
                    className={`flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition ${
                      session.id === chatSessionId
                        ? "border-[#205f4f] bg-[#eaf3ee] text-[#17483c]"
                        : "border-[#e4e7dd] bg-white text-[#455047] hover:bg-[#f2f4ef]"
                    }`}
                    disabled={historyLoading || isSending}
                    key={session.id}
                    onClick={() => void loadChatHistory(session.id)}
                    type="button"
                  >
                    <History className="mt-0.5 shrink-0" size={15} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{session.title || "Untitled chat"}</span>
                      <span className="mt-1 block text-xs text-[#718071]">{session.message_count} 条消息</span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="text-sm leading-6 text-[#627064]">还没有保存的会话。</p>
              )}
            </div>
          </section>

          <section className="rounded-md border border-[#e4e7dd] bg-[#fbfcf8] p-4">
            <h2 className="text-sm font-semibold">本地服务</h2>
            <dl className="mt-3 space-y-2 text-sm text-[#455047]">
              <InfoRow label="Frontend" value=":3000" />
              <InfoRow label="FastAPI" value=":8000" />
              <InfoRow label="Mode" value={runtimeMode} />
              <InfoRow label="Model" value={modelName} />
              <InfoRow label="Session" value={chatSessionId ? chatSessionId.slice(0, 8) : "new"} />
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
                      : "Day 6 · 数据库会话 Chat"}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <WorkspaceButton active={workspace === "requirements"} onClick={() => setWorkspace("requirements")}>
                  <ClipboardList size={16} aria-hidden="true" />
                  需求分析
                </WorkspaceButton>
                <WorkspaceButton active={workspace === "tools"} onClick={() => setWorkspace("tools")}>
                  <Wrench size={16} aria-hidden="true" />
                  Tool Calling
                </WorkspaceButton>
                <WorkspaceButton active={workspace === "chat"} onClick={() => setWorkspace("chat")}>
                  <MessageSquare size={16} aria-hidden="true" />
                  Chat 体验
                </WorkspaceButton>
              </div>
            </div>
          </header>

          {workspace === "requirements" ? (
            <RequirementsPane
              canAnalyze={canAnalyze}
              error={reqError}
              loading={reqLoading}
              onSubmit={handleAnalyzeRequirements}
              result={reqResult}
              text={reqText}
              setText={setReqText}
            />
          ) : workspace === "tools" ? (
            <ToolsPane
              canSend={canSendTools}
              error={toolsError}
              input={toolsInput}
              messages={toolsMessages}
              onRetry={retryTools}
              onStop={stopToolsStreaming}
              onSubmit={handleToolsSubmit}
              retry={Boolean(toolsRetry)}
              setInput={setToolsInput}
              streaming={toolsStreaming}
            />
          ) : (
            <ChatPane
              canSend={canSend}
              error={error}
              historyLoading={historyLoading}
              input={input}
              isSending={isSending}
              messages={messages}
              onRetry={retryChat}
              onSubmit={handleSubmit}
              retry={Boolean(chatRetry)}
              setInput={setInput}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function ChatPane({
  canSend,
  error,
  historyLoading,
  input,
  isSending,
  messages,
  onRetry,
  onSubmit,
  retry,
  setInput,
}: {
  canSend: boolean;
  error: string;
  historyLoading: boolean;
  input: string;
  isSending: boolean;
  messages: ChatMessage[];
  onRetry: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  retry: boolean;
  setInput: (value: string) => void;
}) {
  return (
    <>
      <div className="flex-1 space-y-4 overflow-y-auto bg-[#fbfcf8] p-5">
        {historyLoading ? (
          <div className="flex items-center gap-2 text-sm text-[#627064]">
            <Loader2 className="animate-spin" size={15} aria-hidden="true" />
            正在加载历史
          </div>
        ) : null}
        {messages.map((message, index) => {
          const isLast = index === messages.length - 1;
          const showSpinner = message.role === "assistant" && isLast && isSending && !message.content.trim();
          return <ChatBubble key={message.id} message={message} showSpinner={showSpinner} />;
        })}
      </div>
      <div className="border-t border-[#e4e7dd] bg-white p-4">
        {error ? <ErrorBanner error={error} onRetry={onRetry} retry={retry} disabled={isSending} /> : null}
        <form className="flex flex-col gap-3 md:flex-row" onSubmit={onSubmit}>
          <textarea
            className="min-h-24 flex-1 resize-none rounded-md border border-[#cfd6ca] bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-[#27715e] focus:ring-2 focus:ring-[#27715e]/15"
            onChange={(event) => setInput(event.target.value)}
            placeholder="输入一个问题，后端会自动读取该会话历史并拼上下文"
            value={input}
          />
          <div className="flex gap-2 md:w-32 md:flex-col">
            <button
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-[#205f4f] px-4 text-sm font-medium text-white transition hover:bg-[#17483c] disabled:cursor-not-allowed disabled:bg-[#9daaa1] md:flex-none"
              disabled={!canSend}
              type="submit"
            >
              {isSending ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />}
              发送
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function ToolsPane({
  canSend,
  error,
  input,
  messages,
  onRetry,
  onStop,
  onSubmit,
  retry,
  setInput,
  streaming,
}: {
  canSend: boolean;
  error: string;
  input: string;
  messages: ToolsChatMessage[];
  onRetry: () => void;
  onStop: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  retry: boolean;
  setInput: (value: string) => void;
  streaming: boolean;
}) {
  return (
    <>
      <div className="flex-1 space-y-4 overflow-y-auto bg-[#fbfcf8] p-5">
        <p className="text-sm leading-6 text-[#627064]">
          调用 <span className="font-mono text-[#273029]">POST /api/chat/stream-tools</span>，SSE 中返回工具调用轨迹。
        </p>
        {messages.map((message, index) => {
          const isLast = index === messages.length - 1;
          const showSpinner = message.role === "assistant" && isLast && streaming && !message.content.trim();
          return <ChatBubble key={message.id} message={message} showSpinner={showSpinner} trace={message.toolTrace} />;
        })}
      </div>
      <div className="border-t border-[#e4e7dd] bg-white p-4">
        {error ? <ErrorBanner error={error} onRetry={onRetry} retry={retry} disabled={streaming} /> : null}
        <form className="flex flex-col gap-3 md:flex-row" onSubmit={onSubmit}>
          <textarea
            className="min-h-24 flex-1 resize-none rounded-md border border-[#cfd6ca] bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-[#27715e] focus:ring-2 focus:ring-[#27715e]/15"
            onChange={(event) => setInput(event.target.value)}
            placeholder="描述任务：文档检索、任务计划、FastAPI 草稿等"
            value={input}
          />
          <div className="flex gap-2 md:w-32 md:flex-col">
            <button
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-[#205f4f] px-4 text-sm font-medium text-white transition hover:bg-[#17483c] disabled:cursor-not-allowed disabled:bg-[#9daaa1] md:flex-none"
              disabled={!canSend}
              type="submit"
            >
              {streaming ? <Loader2 className="animate-spin" size={17} /> : <Wrench size={17} />}
              发送
            </button>
            <button
              className="h-11 flex-1 rounded-md border border-[#cfd6ca] px-4 text-sm font-medium text-[#455047] transition hover:bg-[#f2f4ef] disabled:cursor-not-allowed disabled:text-[#9daaa1] md:flex-none"
              disabled={!streaming}
              onClick={onStop}
              type="button"
            >
              停止
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function RequirementsPane({
  canAnalyze,
  error,
  loading,
  onSubmit,
  result,
  setText,
  text,
}: {
  canAnalyze: boolean;
  error: string;
  loading: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  result: RequirementsAnalyzeResponse | null;
  setText: (value: string) => void;
  text: string;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[#fbfcf8]">
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <p className="text-sm leading-6 text-[#627064]">
          调用 <span className="font-mono text-[#273029]">POST /api/requirements/analyze</span>，后端约束 JSON 并用 Pydantic 校验。
        </p>
        {result ? (
          <div className="space-y-4">
            <StructuredBlock title="需求摘要" tone="summary">
              <p className="whitespace-pre-wrap text-sm leading-6 text-[#273029]">{result.analysis.summary}</p>
            </StructuredBlock>
            <StructuredBlock title="用户故事" tone="stories">
              <List items={result.analysis.user_stories} ordered={false} />
            </StructuredBlock>
            <StructuredBlock title="验收标准" tone="criteria">
              <List items={result.analysis.acceptance_criteria} ordered />
            </StructuredBlock>
            <StructuredBlock title="风险点" tone="risks">
              {result.analysis.risks.length ? <List items={result.analysis.risks} ordered={false} /> : <p>暂无风险。</p>}
            </StructuredBlock>
            <p className="text-xs text-[#8a9589]">
              模型：{result.model} · {result.mocked ? "mock 占位" : "供应商输出已校验"}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-[#cfd6ca] bg-white px-4 py-8 text-center text-sm text-[#627064]">
            在下方输入需求描述，结构化结果会出现在这里。
          </div>
        )}
      </div>
      <div className="border-t border-[#e4e7dd] bg-white p-4">
        {error ? <div className="mb-3 rounded-md border border-[#efc6be] bg-[#fff4f1] px-3 py-2 text-sm text-[#9b3323]">{error}</div> : null}
        <form className="flex flex-col gap-3 md:flex-row" onSubmit={onSubmit}>
          <textarea
            className="min-h-28 flex-1 resize-none rounded-md border border-[#cfd6ca] bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-[#27715e] focus:ring-2 focus:ring-[#27715e]/15"
            onChange={(event) => setText(event.target.value)}
            placeholder="输入一段产品或研发需求描述"
            value={text}
          />
          <div className="flex gap-2 md:w-36 md:flex-col">
            <button
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-[#205f4f] px-4 text-sm font-medium text-white transition hover:bg-[#17483c] disabled:cursor-not-allowed disabled:bg-[#9daaa1] md:flex-none"
              disabled={!canAnalyze}
              type="submit"
            >
              {loading ? <Loader2 className="animate-spin" size={17} /> : <ClipboardList size={17} />}
              分析
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChatBubble({
  message,
  showSpinner,
  trace = [],
}: {
  message: ChatMessage;
  showSpinner: boolean;
  trace?: ToolTraceItem[];
}) {
  return (
    <article className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
      {message.role !== "user" ? <MessageAvatar role="assistant" /> : null}
      <div
        className={`max-w-[780px] rounded-lg border px-4 py-3 text-sm leading-6 shadow-sm ${
          message.role === "user"
            ? "border-[#1f5c4d] bg-[#205f4f] text-white"
            : "border-[#e2e6dc] bg-white text-[#273029]"
        }`}
      >
        {message.role === "assistant" && trace.length > 0 ? <ToolTraceList trace={trace} /> : null}
        {message.role === "assistant" ? (
          message.content.trim() ? (
            <AssistantMarkdown content={message.content} />
          ) : showSpinner ? (
            <span className="inline-flex items-center gap-2 text-[#627064]">
              <Loader2 className="animate-spin" size={15} aria-hidden="true" />
              正在生成
            </span>
          ) : (
            <span className="text-xs text-[#8a9589]">暂无正文</span>
          )
        ) : (
          <div className="whitespace-pre-wrap">{message.content}</div>
        )}
      </div>
      {message.role === "user" ? <MessageAvatar role="user" /> : null}
    </article>
  );
}

function ToolTraceList({ trace }: { trace: ToolTraceItem[] }) {
  return (
    <div className="mb-3 space-y-2">
      {trace.map((item, index) => (
        <div
          className="rounded-md border border-[#d8ded0] bg-[#f4f7f0] px-3 py-2 text-left"
          key={`${item.toolCallId ?? "call"}-${index}-${item.name}`}
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

function GoalBlock({
  goals,
  title,
  tone,
}: {
  goals: string[];
  title: string;
  tone: "green" | "blue" | "purple" | "brown";
}) {
  const color =
    tone === "green" ? "text-[#27715e]" : tone === "blue" ? "text-[#2a6b8f]" : tone === "purple" ? "text-[#6b4a9a]" : "text-[#8a6a2f]";
  return (
    <section className="rounded-md border border-[#e4e7dd] bg-[#fbfcf8] p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-3 space-y-3">
        {goals.map((goal) => (
          <div className="flex items-start gap-2 text-sm text-[#455047]" key={goal}>
            <CheckCircle2 className={`mt-0.5 shrink-0 ${color}`} size={16} aria-hidden="true" />
            <span>{goal}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function WorkspaceButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition ${
        active ? "border-[#205f4f] bg-[#205f4f] text-white" : "border-[#dfe3d8] text-[#455047] hover:bg-[#f2f4ef]"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function ErrorBanner({
  disabled,
  error,
  onRetry,
  retry,
}: {
  disabled: boolean;
  error: string;
  onRetry: () => void;
  retry: boolean;
}) {
  return (
    <div className="mb-3 flex flex-col gap-2 rounded-md border border-[#efc6be] bg-[#fff4f1] px-3 py-2 text-sm text-[#9b3323] sm:flex-row sm:items-center sm:justify-between">
      <span className="min-w-0 flex-1">{error}</span>
      {retry ? (
        <button
          className="inline-flex shrink-0 items-center justify-center gap-1.5 self-start rounded-md border border-[#d4a39c] bg-white px-3 py-1.5 text-xs font-medium text-[#7a2e22] transition hover:bg-[#fff8f6] disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
          disabled={disabled}
          onClick={onRetry}
          type="button"
        >
          <RotateCcw size={14} aria-hidden="true" />
          重试
        </button>
      ) : null}
    </div>
  );
}

function StructuredBlock({
  children,
  title,
  tone,
}: {
  children: ReactNode;
  title: string;
  tone: "summary" | "stories" | "criteria" | "risks";
}) {
  const bar =
    tone === "summary" ? "bg-[#205f4f]" : tone === "stories" ? "bg-[#2a6b8f]" : tone === "criteria" ? "bg-[#6b5a2a]" : "bg-[#8a3d3d]";
  return (
    <section className="rounded-lg border border-[#e2e6dc] bg-white shadow-sm">
      <div className={`h-1 w-full rounded-t-lg ${bar}`} />
      <div className="px-4 py-3">
        <h3 className="text-sm font-semibold text-[#1f2520]">{title}</h3>
        <div className="mt-3 text-sm leading-6 text-[#273029]">{children}</div>
      </div>
    </section>
  );
}

function List({ items, ordered }: { items: string[]; ordered: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={`${ordered ? "list-decimal" : "list-disc"} space-y-2 pl-5 text-sm leading-6 text-[#273029]`}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </Tag>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="max-w-32 truncate font-mono">{value}</dd>
    </div>
  );
}

function MessageAvatar({ role }: { role: "user" | "assistant" }) {
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

function toUiChatMessage(message: ApiChatMessage): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: message.role === "system" ? "assistant" : message.role,
    content: message.content,
  };
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
      const dataLine = eventText.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) {
        continue;
      }
      onEvent(JSON.parse(dataLine.replace(/^data:\s*/, "")) as StreamEvent);
    }
  }
}
