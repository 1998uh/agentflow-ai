"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { Bot, CheckCircle2, Loader2, Send, Sparkles, User } from "lucide-react";

type Role = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: Role;
  content: string;
};

type StreamEvent = {
  type: "delta" | "done";
  content?: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "你好，我是 AgentFlow AI。今天我们先跑通 AI 应用开发的最小闭环：前端输入、FastAPI 接口、SSE 流式响应。",
  },
];

const dayOneGoals = [
  "FastAPI 提供 /api/chat/stream",
  "Next.js 前端展示流式回复",
  "后端支持无 API Key 的 mock 模式",
  "为明天接入真实模型 API 留好服务层",
];

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("帮我解释一下今天这个项目骨架");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !isStreaming, [input, isStreaming]);

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
      console.log(response.body);

      await readSseStream(response.body, (eventData) => {
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
              面向求职项目的 AI Agent 应用开发训练营。今天先把全栈最小闭环跑通。
            </p>
          </div>

          <section className="rounded-md border border-[#e4e7dd] bg-[#fbfcf8] p-4">
            <h2 className="text-sm font-semibold">Day 1 目标</h2>
            <div className="mt-3 space-y-3">
              {dayOneGoals.map((goal) => (
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
                <dd className="font-mono">mock</dd>
              </div>
            </dl>
          </section>
        </aside>

        <section className="flex min-h-[720px] flex-col overflow-hidden rounded-lg border border-[#dfe3d8] bg-white shadow-sm">
          <header className="border-b border-[#e4e7dd] px-5 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-[#627064]">AI Application Workspace</p>
                <h2 className="text-xl font-semibold">流式聊天接口验证</h2>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-[#dfe3d8] px-3 py-2 text-sm text-[#455047]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#2a8d69]" />
                FastAPI SSE
              </div>
            </div>
          </header>

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
                placeholder="输入一个问题，验证前后端流式响应..."
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
        </section>
      </div>
    </main>
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

