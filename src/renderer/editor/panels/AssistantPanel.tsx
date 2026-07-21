/**
 * AI assistant tool: chat with Gemini about the open project. The assistant
 * inspects the timeline, runs local analysis, and applies edits (zooms, cuts,
 * speed, subtitles, transitions) through the same guarded pipeline external
 * AI CLIs use — every applied edit shows an undo chip.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles, Trash2, X } from "lucide-react";
import type { GeminiChatMessage, ProviderKeysView } from "../../../shared/types";
import { ApiKeyPromptPill } from "./ApiKeyPromptPill";
import { ChatMessageBubble } from "./assistant/ChatMessageBubble";

const quickActions = [
  "Add zooms to the important moments",
  "Speed up the silent parts",
  "Remove filler words",
  "Add subtitles",
  "Add transitions between clips"
];

export function AssistantPanel(props: {
  projectId: string | null;
  providerKeys: ProviderKeysView | null;
  messages: GeminiChatMessage[];
  sending: boolean;
  statusMessage: string | null;
  chatError: string | null;
  onSend: (message: string) => void;
  onCancel: () => void;
  onReset: () => void;
  onUndoEdit: () => void;
  onOpenAiSettings: () => void;
}) {
  const [draft, setDraft] = useState("");
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [props.messages.length, props.statusMessage]);

  const providerKeysLoading = props.providerKeys === null;
  const hasGeminiKey = props.providerKeys?.hasGeminiKey === true;
  const missingKey = !providerKeysLoading && !hasGeminiKey;
  const canSend =
    props.projectId !== null && !props.sending && hasGeminiKey && draft.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    props.onSend(draft);
    setDraft("");
  };

  if (props.projectId === null) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-sm font-bold text-slate-400">
        Save the project once before chatting with the assistant.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-[#0e0e10] shadow-inner ring-1 ring-white/[0.05]">
      {providerKeysLoading ? (
        <p className="m-2.5 flex flex-none items-center gap-2 rounded-lg bg-white/[0.045] px-3 py-2 text-[0.68rem] text-neutral-400">
          <Loader2 className="animate-spin" size={12} /> Loading Gemini settings…
        </p>
      ) : missingKey ? (
        <ApiKeyPromptPill
          className="m-2.5 flex-none"
          onClick={props.onOpenAiSettings}
          provider="gemini"
        >
          Add your Gemini API key to use the assistant
        </ApiKeyPromptPill>
      ) : null}

      {props.messages.length > 0 ? (
        <div className="flex h-10 flex-none items-center justify-between border-b border-white/[0.06] px-3">
          <span className="text-[0.66rem] font-bold text-neutral-500">AI assistant</span>
          <button
            aria-label="Clear conversation"
            className="grid size-7 place-items-center rounded-full text-neutral-600 transition hover:bg-white/[0.06] hover:text-neutral-300"
            title="Clear conversation"
            type="button"
            onClick={props.onReset}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ) : null}

      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-3.5 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3"
        data-assistant-thread
        ref={threadRef}
      >
        {props.messages.length === 0 ? (
          <div className="flex min-h-full min-w-0 flex-col justify-end gap-3 pb-1">
            <div className="max-w-[88%] rounded-2xl rounded-bl-[0.3rem] bg-[#252527] px-3 py-2.5 text-xs leading-[1.5] text-neutral-100">
              <p className="flex items-center gap-1.5 font-bold"><Sparkles size={13} /> What would you like to edit?</p>
              <p className="mt-1 text-neutral-400">Choose a suggestion or write your own instruction.</p>
            </div>
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {quickActions.map((action) => (
                <button
                  className="min-w-0 rounded-full bg-white/[0.06] px-2.5 py-1.5 text-left text-[0.65rem] font-semibold text-neutral-300 transition hover:bg-white/[0.11] hover:text-white disabled:opacity-50"
                  type="button"
                  key={action}
                  disabled={props.sending || !hasGeminiKey}
                  onClick={() => props.onSend(action)}
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {props.messages.map((message) => (
          <ChatMessageBubble
            key={message.id}
            message={message}
            onUndoEdit={props.onUndoEdit}
          />
        ))}

        {props.sending ? (
          <div className="flex min-w-0 max-w-[88%] items-center gap-2 self-start rounded-2xl rounded-bl-[0.3rem] bg-[#252527] px-3 py-2.5 text-xs text-neutral-300">
            <Loader2 className="animate-spin" size={13} />
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">
              {props.statusMessage ?? "Working…"}
            </span>
            <button
              aria-label="Stop generating"
              className="ml-1 rounded p-0.5 text-neutral-500 transition hover:bg-white/10 hover:text-white"
              type="button"
              title="Stop"
              onClick={props.onCancel}
            >
              <X size={12} />
            </button>
          </div>
        ) : null}

        {props.chatError ? (
          <p className="rounded-lg border border-rose-400/20 bg-rose-500/[0.08] px-3 py-2 text-xs text-rose-300">
            {props.chatError}
          </p>
        ) : null}
      </div>

      <div
        className="flex min-w-0 flex-none items-end gap-2 border-t border-white/[0.06] bg-[#111113] p-3"
        data-assistant-composer
      >
        <textarea
          aria-label="Message the AI assistant"
          className="max-h-28 min-h-10 w-full min-w-0 resize-none rounded-xl bg-white/[0.07] px-3 py-2.5 text-xs font-semibold leading-5 text-white outline-none ring-1 ring-transparent transition placeholder:text-neutral-500 focus:bg-white/[0.09] focus:ring-white/[0.12] disabled:cursor-not-allowed disabled:opacity-60"
          placeholder={
            providerKeysLoading
              ? "Loading Gemini settings…"
              : missingKey
                ? "Add a Gemini API key first…"
                : "Write a message"
          }
          rows={1}
          value={draft}
          disabled={props.sending || !hasGeminiKey}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button
          aria-label="Send message"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-black transition hover:bg-neutral-200 disabled:bg-white/[0.07] disabled:text-neutral-600"
          type="button"
          disabled={!canSend}
          onClick={submit}
          title="Send message"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
