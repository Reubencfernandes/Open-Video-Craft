import { useEffect, useState } from "react";
import { Check, Copy, RotateCcw } from "lucide-react";
import type { GeminiChatMessage } from "../../../../shared/types";
import { ChatMarkdown } from "./ChatMarkdown";

function messageTime(createdAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(createdAt));
}

export function ChatMessageBubble(props: {
  message: GeminiChatMessage;
  onUndoEdit: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const outgoing = props.message.role === "user";
  const createdAt = typeof props.message.createdAt === "number" && Number.isFinite(props.message.createdAt)
    ? props.message.createdAt
    : null;

  useEffect(() => {
    setCopied(false);
  }, [props.message.id, props.message.text]);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function copyQuery() {
    const didCopy = await copyText(props.message.text);
    setCopied(didCopy);
  }

  return (
    <article
      className={`grid w-full min-w-0 ${outgoing ? "justify-items-end" : "justify-items-start"}`}
      data-chat-role={props.message.role}
    >
      <div
        className={`min-w-0 max-w-[88%] rounded-2xl px-3 py-2.5 text-xs leading-[1.5] shadow-sm ${
          outgoing
            ? "rounded-br-[0.3rem] bg-white text-[#141416]"
            : "rounded-bl-[0.3rem] bg-[#252527] text-neutral-100"
        }`}
      >
        {outgoing ? (
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{props.message.text}</p>
        ) : (
          <ChatMarkdown>{props.message.text}</ChatMarkdown>
        )}

        {props.message.editSummary ? (
          <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-1.5 rounded-lg bg-emerald-400/[0.1] px-2 py-1.5 text-[0.62rem] font-bold text-emerald-200">
            <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
              ✓ {props.message.editSummary}
            </span>
            <button
              aria-label="Undo this AI edit"
              className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 transition hover:bg-white/10"
              type="button"
              onClick={props.onUndoEdit}
            >
              <RotateCcw size={11} /> Undo
            </button>
          </div>
        ) : null}
      </div>
      {outgoing || createdAt !== null ? (
        <div
          className={`mt-1 flex items-center gap-1.5 px-1 text-[0.58rem] text-neutral-600 ${outgoing ? "justify-end" : "justify-start"}`}
        >
          {outgoing ? (
            <button
              aria-label={copied ? "Sent query copied" : "Copy sent query"}
              className="inline-flex items-center gap-1 rounded px-1 py-0.5 transition hover:bg-white/[0.06] hover:text-neutral-300"
              title={copied ? "Copied" : "Copy query"}
              type="button"
              onClick={() => void copyQuery()}
            >
              {copied ? <Check size={10} /> : <Copy size={10} />}
              {copied ? "Copied" : "Copy"}
            </button>
          ) : null}
          {createdAt !== null ? (
            <time dateTime={new Date(createdAt).toISOString()}>
              {outgoing ? "Sent " : ""}{messageTime(createdAt)}
            </time>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}
