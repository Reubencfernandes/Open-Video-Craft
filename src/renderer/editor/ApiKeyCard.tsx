/** Compact provider card with an on-demand encrypted API-key editor. */
import { Check, ExternalLink, Eye, EyeOff, KeyRound, Pencil, Trash2 } from "lucide-react";
import CohereIcon from "@lobehub/icons/es/Cohere/components/Color";
import GeminiIcon from "@lobehub/icons/es/Gemini/components/Color";
import { useState } from "react";

export function ApiKeyCard(props: {
  title: string;
  description: string;
  capabilities?: string[];
  accent?: "gemini" | "cohere";
  hasKey: boolean;
  keyUrl: string;
  keyUrlLabel: string;
  disabled: boolean;
  onReveal: () => Promise<string | null>;
  onSave: (apiKey: string) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const isGemini = props.accent === "gemini";

  const closeEditor = () => {
    setDraft("");
    setShowKey(false);
    setEditing(false);
  };

  const reveal = async () => {
    setBusy(true);
    try {
      const apiKey = await props.onReveal();
      if (apiKey) {
        setDraft(apiKey);
        setShowKey(true);
        setEditing(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await props.onSave(draft.trim());
      closeEditor();
    } catch {
      // The dialog owns the visible error. Keep the value available to retry.
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await props.onClear();
      closeEditor();
    } catch {
      // The dialog owns the visible error.
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className="flex min-h-[12.5rem] min-w-0 flex-col overflow-hidden rounded-xl bg-[#18181b] shadow-[0_8px_28px_rgb(0_0_0_/_0.18)] transition-colors hover:bg-[#1c1c1f]"
      data-provider-card={props.accent}
    >
      <div className="flex flex-1 items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-white">{props.title}</h3>
            {props.hasKey ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-[0.6rem] font-bold text-emerald-300">
                <Check size={10} /> Connected
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-[0.68rem] leading-4 text-neutral-400">{props.description}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(props.capabilities ?? []).map((capability, index) => (
              <span
                className={`rounded-full px-2 py-1 text-[0.58rem] font-bold ${
                  index % 3 === 0
                    ? "bg-emerald-400/[0.09] text-emerald-300"
                    : index % 3 === 1
                      ? "bg-sky-400/[0.09] text-sky-300"
                      : "bg-amber-300/[0.09] text-amber-200"
                }`}
                key={capability}
              >
                {capability}
              </span>
            ))}
          </div>
        </div>
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.045]">
          {isGemini ? <GeminiIcon size={27} /> : <CohereIcon size={27} />}
        </span>
      </div>

      {editing ? (
        <div className="grid gap-2.5 bg-black/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[0.65rem] font-bold text-neutral-300">
              <KeyRound size={12} /> {props.hasKey ? "Update API key" : "Connect API key"}
            </span>
            <button
              className="inline-flex items-center gap-1 text-[0.6rem] font-semibold text-neutral-500 transition hover:text-white"
              type="button"
              onClick={() => void window.openVideoCraft.app.openExternal(props.keyUrl)}
            >
              {props.keyUrlLabel} <ExternalLink size={10} />
            </button>
          </div>
          <div className="relative min-w-0">
            <input
              className="h-9 w-full min-w-0 rounded-lg bg-[#0e0e10] px-2.5 pr-9 text-xs font-semibold text-white outline-none transition-colors placeholder:text-neutral-600 focus:bg-[#141417]"
              type={showKey ? "text" : "password"}
              aria-label={`${props.title} API key`}
              placeholder="Paste API key…"
              value={draft}
              disabled={props.disabled || busy}
              onChange={(event) => {
                setDraft(event.target.value);
                if (!event.target.value) setShowKey(false);
              }}
            />
            {draft ? (
              <button
                className="absolute inset-y-0 right-0 grid w-9 place-items-center text-neutral-500 transition hover:text-white"
                type="button"
                aria-label={showKey ? `Hide ${props.title} API key` : `Show ${props.title} API key`}
                disabled={props.disabled || busy}
                onClick={() => setShowKey((current) => !current)}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="h-8 rounded-lg px-3 text-xs font-bold text-neutral-400 transition hover:bg-white/[0.06] hover:text-white"
              type="button"
              disabled={busy}
              onClick={closeEditor}
            >
              Cancel
            </button>
            <button
              className="h-8 rounded-lg bg-white px-3 text-xs font-bold text-black transition hover:bg-neutral-200 disabled:bg-white/[0.08] disabled:text-neutral-600"
              type="button"
              disabled={props.disabled || busy || draft.trim().length === 0}
              onClick={() => void save()}
            >
              {props.hasKey ? "Update key" : "Save key"}
            </button>
          </div>
        </div>
      ) : (
        <div className={`grid min-h-12 gap-2 px-2 pb-2 ${props.hasKey ? "grid-cols-2" : "grid-cols-1"}`}>
          <button
            className="inline-flex items-center justify-center gap-2 text-xs font-bold text-neutral-300 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-45"
            type="button"
            disabled={props.disabled || busy}
            onClick={() => void (props.hasKey ? reveal() : setEditing(true))}
          >
            {props.hasKey ? <Pencil size={13} /> : <KeyRound size={13} />}
            {busy ? "Loading…" : props.hasKey ? "Update" : "Connect"}
          </button>
          {props.hasKey ? (
            <button
              className="inline-flex items-center justify-center gap-2 text-xs font-bold text-neutral-400 transition hover:bg-rose-400/[0.06] hover:text-rose-200 disabled:opacity-45"
              type="button"
              disabled={props.disabled || busy}
              onClick={() => void clear()}
            >
              <Trash2 size={13} /> Delete
            </button>
          ) : null}
        </div>
      )}
    </article>
  );
}
