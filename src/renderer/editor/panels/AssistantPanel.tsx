/**
 * AI assistant tool: chat with Gemini about the open project. The assistant
 * inspects the timeline, runs local analysis, and applies edits (zooms, cuts,
 * speed, subtitles, transitions) through the same guarded pipeline external
 * AI CLIs use — every applied edit shows an undo chip.
 */
import { useEffect, useRef, useState } from "react";
import { KeyRound, Loader2, RotateCcw, Send, Sparkles, Trash2, X } from "lucide-react";
import type { GeminiChatMessage, ProviderKeysView } from "../../../shared/types";

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
  includeVideo: boolean;
  videoConsent: boolean;
  onIncludeVideoChange: (value: boolean) => void;
  onVideoConsentChange: (value: boolean) => void;
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

  const missingKey = props.providerKeys?.hasGeminiKey === false;
  const canSend =
    props.projectId !== null && !props.sending && !missingKey && draft.trim().length > 0;

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
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3">
      <div className="grid gap-2">
        {missingKey ? (
          <button
            className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-400/10 px-2 text-xs font-bold text-amber-200 hover:bg-amber-400/20"
            type="button"
            onClick={props.onOpenAiSettings}
          >
            <KeyRound size={13} /> Add your Gemini API key to use the assistant
          </button>
        ) : (
          <label className="flex items-start gap-2 text-[0.68rem] leading-4 text-slate-400">
            <input
              className="mt-0.5 accent-white"
              type="checkbox"
              checked={props.includeVideo}
              onChange={(event) => props.onIncludeVideoChange(event.target.checked)}
            />
            <span>
              Let Gemini watch the video (uploads the recording to Google for this
              conversation so it can see and hear the footage).
            </span>
          </label>
        )}
        {props.includeVideo && !props.videoConsent ? (
          <label className="flex items-start gap-2 rounded-md border border-amber-400/30 bg-amber-400/10 p-2 text-[0.68rem] leading-4 text-amber-100">
            <input
              className="mt-0.5 accent-white"
              type="checkbox"
              checked={props.videoConsent}
              onChange={(event) => props.onVideoConsentChange(event.target.checked)}
            />
            <span>
              I understand my recording will be sent to Google and handled under the
              Gemini API data policy.
            </span>
          </label>
        ) : null}
      </div>

      <div className="grid min-h-0 content-start gap-2 overflow-auto pr-1" ref={threadRef}>
        {props.messages.length === 0 ? (
          <div className="grid gap-2">
            <p className="flex items-center gap-2 text-xs font-bold text-slate-400">
              <Sparkles size={14} /> Ask me to edit this project
            </p>
            {quickActions.map((action) => (
              <button
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-left text-xs font-bold text-slate-300 hover:bg-white/[0.08] hover:text-white"
                type="button"
                key={action}
                disabled={props.sending || missingKey}
                onClick={() => props.onSend(action)}
              >
                {action}
              </button>
            ))}
          </div>
        ) : null}

        {props.messages.map((message) => (
          <div
            className={`grid max-w-[92%] gap-1 rounded-lg px-3 py-2 text-xs leading-4 ${
              message.role === "user"
                ? "justify-self-end bg-violet-500/20 text-white"
                : "justify-self-start border border-white/10 bg-white/[0.04] text-slate-200"
            }`}
            key={message.id}
          >
            <span className="whitespace-pre-wrap break-words">{message.text}</span>
            {message.editSummary ? (
              <div className="mt-1 flex items-center justify-between gap-2 rounded border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[0.62rem] font-bold text-emerald-200">
                <span className="min-w-0 truncate">✓ {message.editSummary}</span>
                <button
                  className="inline-flex shrink-0 items-center gap-1 rounded px-1 hover:bg-white/10"
                  type="button"
                  title="Undo this AI edit"
                  onClick={props.onUndoEdit}
                >
                  <RotateCcw size={11} /> Undo
                </button>
              </div>
            ) : null}
          </div>
        ))}

        {props.sending ? (
          <div className="flex items-center gap-2 justify-self-start rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300">
            <Loader2 className="animate-spin" size={13} />
            {props.statusMessage ?? "Working…"}
            <button
              className="ml-1 rounded p-0.5 text-slate-500 hover:bg-white/10 hover:text-white"
              type="button"
              title="Stop"
              onClick={props.onCancel}
            >
              <X size={12} />
            </button>
          </div>
        ) : null}

        {props.chatError ? (
          <p className="rounded bg-red-500/10 px-3 py-2 text-xs text-red-300">{props.chatError}</p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-end gap-2">
          <textarea
            className="min-h-10 w-full resize-none rounded-lg border border-white/10 bg-black/20 p-2.5 text-xs font-semibold text-white outline-none focus:border-violet-400"
            placeholder={missingKey ? "Add a Gemini API key first…" : "e.g. delete the part where nothing happens"}
            rows={2}
            value={draft}
            disabled={props.sending || missingKey}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <button
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.055] text-white hover:bg-white/10 disabled:opacity-50"
            type="button"
            disabled={!canSend}
            onClick={submit}
            title="Send"
          >
            <Send size={14} />
          </button>
        </div>
        {props.messages.length > 0 ? (
          <button
            className="inline-flex items-center gap-1 justify-self-start rounded px-1 text-[0.62rem] font-bold text-slate-500 hover:text-slate-300"
            type="button"
            onClick={props.onReset}
          >
            <Trash2 size={11} /> Clear conversation
          </button>
        ) : null}
      </div>
    </div>
  );
}
