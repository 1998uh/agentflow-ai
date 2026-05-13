"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [code]);

  return (
    <div className="my-2 overflow-hidden rounded-md border border-[#d8ded0] bg-[#1a1f1c] text-[#e8ebe3]">
      <div className="flex items-center justify-between gap-2 border-b border-[#2d3530] px-2 py-1.5 text-[11px] text-[#9aa396]">
        <span className="font-mono uppercase">{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-[#c5cbc0] transition hover:bg-[#2d3530] hover:text-white"
          aria-label="复制代码"
        >
          {copied ? (
            <>
              <Check size={12} aria-hidden />
              已复制
            </>
          ) : (
            <>
              <Copy size={12} aria-hidden />
              复制
            </>
          )}
        </button>
      </div>
      <pre className="max-h-72 overflow-auto p-3 font-mono text-[12px] leading-5 text-[#e4e8df]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

const markdownComponents: Components = {
  a: ({ href, children, ...props }) => (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-[#205f4f] underline underline-offset-2 hover:text-[#17483c]"
    >
      {children}
    </a>
  ),
  p: ({ children }) => <p className="mb-2 last:mb-0 [&+p]:mt-2">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-6">{children}</li>,
  h1: ({ children }) => <h3 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-1.5 mt-2 text-sm font-semibold first:mt-0">{children}</h4>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-4 border-[#27715e]/40 bg-[#f4f7f0] py-1 pl-3 text-[#455047]">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-[#dfe3d8]" />,
  table: ({ children }) => (
    <div className="my-2 max-w-full overflow-x-auto rounded-md border border-[#dfe3d8]">
      <table className="w-full min-w-[240px] border-collapse text-left text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[#eef1e9] text-[#273029]">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-[#dfe3d8] px-3 py-2 font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-[#eef0ea] px-3 py-2">{children}</td>,
  tr: ({ children }) => <tr className="even:bg-[#fafbf8]">{children}</tr>,
  code({ className, children, ...props }) {
    const inline = !className?.includes("language-");
    if (inline) {
      return (
        <code
          className="rounded bg-[#eef1e9] px-1.5 py-0.5 font-mono text-[0.8125rem] text-[#273029]"
          {...props}
        >
          {children}
        </code>
      );
    }
    const lang = /language-(\w+)/.exec(className ?? "")?.[1] ?? "code";
    const code = String(children).replace(/\n$/, "");
    return <CodeBlock code={code} language={lang} />;
  },
  pre: ({ children }) => <div className="contents">{children}</div>,
};

export function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="assistant-md text-sm leading-6 text-[#273029] [&_strong]:font-semibold [&_strong]:text-[#1f2520]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
