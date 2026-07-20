import { useEffect, useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import type {
  AiConnectionStatus,
  AiProvider,
  ProviderKeyId,
  ProviderKeysView,
  UpdateProviderKeysRequest
} from "../../shared/types";
import type { EditorMutation } from "../../shared/editor-domain";
import { AiLastEditCard } from "./AiLastEditCard";
import { AiProviderConnectionCard } from "./AiProviderConnectionCard";
import { ApiKeyCard } from "./ApiKeyCard";

export function AiConnectionDialog(props: {
  open: boolean;
  lastAgentEdit: EditorMutation | null;
  onClose: () => void;
  onUndo: () => Promise<void>;
  onProviderKeysChanged?: () => void;
}) {
  const [status, setStatus] = useState<AiConnectionStatus | null>(null);
  const [providerKeys, setProviderKeys] = useState<ProviderKeysView | null>(null);
  const [busy, setBusy] = useState<AiProvider | "undo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "editing" | "transcription" | "music">("all");

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    void window.openVideoCraft.ai.getStatus().then(setStatus)
      .catch((loadError) => setError(String(loadError)));
    void window.openVideoCraft.providers.get().then(setProviderKeys).catch(() => undefined);
  }, [props.open]);

  const updateKeys = async (request: UpdateProviderKeysRequest) => {
    try {
      setProviderKeys(await window.openVideoCraft.providers.update(request));
      props.onProviderKeysChanged?.();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : String(updateError));
      throw updateError;
    }
  };

  const revealKey = async (provider: ProviderKeyId): Promise<string | null> => {
    setError(null);
    try {
      return await window.openVideoCraft.providers.reveal(provider);
    } catch (revealError) {
      setError(revealError instanceof Error ? revealError.message : String(revealError));
      return null;
    }
  };

  if (!props.open) return null;

  const configure = async (provider: AiProvider, connected: boolean) => {
    setBusy(provider); setError(null);
    try {
      const next = connected
        ? await window.openVideoCraft.ai.disconnect(provider)
        : await window.openVideoCraft.ai.configure({ provider, privacyAccepted: true });
      setStatus(next);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-[80] grid min-h-0 place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="AI connection">
      <section className="flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl min-h-0 flex-col overflow-hidden rounded-2xl bg-[#101012] shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 px-6 pb-3 pt-5">
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight text-white">Set up AI connections</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-neutral-400">
              Connect Claude Code and securely manage the API keys used for video editing, subtitles, and generated music.
            </p>
          </div>
          <button aria-label="Close AI connection settings" className="grid size-8 place-items-center rounded-lg text-neutral-400 transition hover:bg-white/[0.08] hover:text-white" onClick={props.onClose} type="button"><X size={17} /></button>
        </header>

        <div className="grid min-h-0 gap-5 overflow-y-auto p-6">
          <div className="flex min-w-0 flex-wrap items-center gap-2" aria-label="AI provider filters">
            {([
              ["all", "All"],
              ["editing", "Video editing"],
              ["transcription", "Transcription"],
              ["music", "Music"]
            ] as const).map(([id, label]) => (
              <button
                className={`editor-choice-button rounded-lg px-3 py-2 text-xs font-bold ${
                  filter === id ? "bg-white text-black" : "bg-white/[0.045] text-neutral-400 hover:bg-white/[0.08] hover:text-white"
                }`}
                type="button"
                aria-pressed={filter === id}
                key={id}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(filter === "all" || filter === "editing")
              ? (status?.providers ?? []).filter((provider) => provider.provider === "claude").map((provider) => (
                  <AiProviderConnectionCard
                    key={provider.provider}
                    provider={provider}
                    busy={busy}
                    onConfigure={configure}
                  />
                ))
              : null}
            {filter === "all" || filter === "editing" || filter === "transcription" || filter === "music" ? (
              <ApiKeyCard
                title="Google Gemini"
                description="Built-in AI editing assistant, cloud transcription, and Lyria music generation."
                capabilities={["Video editing", "Transcription", "Music"]}
                accent="gemini"
                hasKey={providerKeys?.hasGeminiKey ?? false}
                keyUrl="https://aistudio.google.com/apikey"
                keyUrlLabel="Get API key"
                disabled={providerKeys === null}
                onReveal={() => revealKey("gemini")}
                onSave={(apiKey) => updateKeys({ geminiApiKey: apiKey })}
                onClear={() => updateKeys({ geminiApiKey: null })}
              />
            ) : null}
            {filter === "all" || filter === "transcription" ? (
              <ApiKeyCard
                title="Cohere"
                description="Cloud speech transcription for subtitles in 14 supported languages."
                capabilities={["Transcription", "Subtitles"]}
                accent="cohere"
                hasKey={providerKeys?.hasCohereKey ?? false}
                keyUrl="https://dashboard.cohere.com/api-keys"
                keyUrlLabel="Get API key"
                disabled={providerKeys === null}
                onReveal={() => revealKey("cohere")}
                onSave={(apiKey) => updateKeys({ cohereApiKey: apiKey })}
                onClear={() => updateKeys({ cohereApiKey: null })}
              />
            ) : null}
          </div>

          <div className="rounded-xl bg-white/[0.035] p-4 text-xs leading-5 text-neutral-400">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 shrink-0 text-emerald-300" size={16} />
              <p>
                API keys are {providerKeys?.encryptionAvailable === false ? "stored locally with obfuscation because the OS keychain is unavailable" : "encrypted and stored on this computer"}. Gemini uploads the current video only when you send an assistant request.
              </p>
            </div>
          </div>

          {props.lastAgentEdit?.editId ? (
            <AiLastEditCard
              mutation={props.lastAgentEdit}
              disabled={busy !== null}
              onUndo={() => void (async () => {
                setBusy("undo");
                try { await props.onUndo(); }
                catch (undoError) { setError(String(undoError)); }
                finally { setBusy(null); }
              })()}
            />
          ) : null}
          {error ? <p className="rounded-lg bg-rose-500/[0.1] px-3 py-2 text-xs text-rose-300">{error}</p> : null}
        </div>
      </section>
    </div>
  );
}
