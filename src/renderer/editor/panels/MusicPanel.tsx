/**
 * Music AI tool: generate background music with ACE-Step (local) or Lyria 3
 * (Gemini cloud) and drop it straight onto the timeline as background audio.
 */
import { useState } from "react";
import { Download, KeyRound, Loader2, Music4, X } from "lucide-react";
import type { MusicEngine, MusicSetupStatus, ProviderKeysView } from "../../../shared/types";
import type {
  MusicGenerationForm,
  MusicGenerationState
} from "../useMusicGeneration";
import type { MusicGenerateProgressEvent } from "../../../shared/types";

const engineOptions: Array<{ id: MusicEngine; label: string; hint: string }> = [
  {
    id: "acestep",
    label: "ACE-Step (local)",
    hint: "Runs on this Mac. First use installs Python packages and downloads ~7 GB of model weights."
  },
  {
    id: "lyria-clip",
    label: "Lyria 3 Clip (cloud)",
    hint: "30-second clips via your Gemini API key. Output carries an inaudible SynthID watermark."
  },
  {
    id: "lyria-pro",
    label: "Lyria 3 Pro (cloud)",
    hint: "Full-length songs via your Gemini API key; steer the length in the prompt (e.g. “a 2-minute song”)."
  }
];

const phaseLabels: Record<MusicGenerateProgressEvent["phase"], string> = {
  starting: "Starting…",
  "downloading-checkpoints": "Downloading model (~7 GB, one time)…",
  "loading-model": "Loading model…",
  generating: "Generating music…",
  saving: "Adding to timeline…"
};

export function MusicPanel(props: {
  setupStatus: MusicSetupStatus | null;
  installing: boolean;
  installLog: string[];
  generationState: MusicGenerationState;
  progress: MusicGenerateProgressEvent | null;
  lastLyrics: string | null;
  providerKeys: ProviderKeysView | null;
  onInstall: () => void;
  onGenerate: (form: MusicGenerationForm) => void;
  onCancel: () => void;
  onOpenAiSettings: () => void;
}) {
  const [engine, setEngine] = useState<MusicEngine>("acestep");
  const [prompt, setPrompt] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [seedText, setSeedText] = useState("");

  const generating = props.generationState === "generating";
  const status = props.setupStatus;
  const needsPython = engine === "acestep" && status !== null && status.pythonPath === null;
  const needsInstall =
    engine === "acestep" && status !== null && status.pythonPath !== null && !status.acestepInstalled;
  const needsGeminiKey = engine !== "acestep" && props.providerKeys?.hasGeminiKey === false;
  const acestepReady = status?.acestepInstalled === true;
  const canGenerate =
    prompt.trim().length > 0 &&
    !generating &&
    !props.installing &&
    (engine === "acestep" ? acestepReady : !needsGeminiKey);

  const selectedEngine = engineOptions.find((option) => option.id === engine);

  return (
    <div className="grid min-h-0 content-start gap-3 overflow-auto">
      <label className="grid gap-1 text-xs">
        <span className="font-bold text-slate-400">Engine</span>
        <select
          className="h-9 w-full min-w-0 rounded-md border border-white/10 bg-black/20 px-2 font-semibold text-white outline-none focus:border-violet-400"
          value={engine}
          disabled={generating}
          onChange={(event) => setEngine(event.target.value as MusicEngine)}
        >
          {engineOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[0.68rem] leading-4 text-slate-500">{selectedEngine?.hint}</p>

      {needsPython ? (
        <div className="grid gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-100">
          <span className="font-bold">Python 3.10–3.12 not found</span>
          <span>
            ACE-Step runs on Python. Install Python 3.12 and reopen this panel.
          </span>
          <button
            className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-amber-300/40 px-2 font-bold hover:bg-amber-400/20"
            type="button"
            onClick={() => void window.openVideoCraft.app.openExternal("https://www.python.org/downloads/")}
          >
            Get Python
          </button>
        </div>
      ) : null}

      {needsInstall ? (
        <div className="grid gap-2 rounded-lg border border-white/[0.08] p-3 text-xs">
          <span className="font-bold text-slate-300">
            One-time setup: install the ACE-Step engine (several GB of Python packages).
          </span>
          <button
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.055] px-3 font-bold text-white hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
            type="button"
            disabled={props.installing}
            onClick={props.onInstall}
          >
            {props.installing ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
            {props.installing ? "Installing…" : "Install ACE-Step"}
          </button>
          {props.installing && props.installLog.length > 0 ? (
            <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-black/30 p-2 text-[0.6rem] leading-3 text-slate-400">
              {props.installLog.slice(-8).join("\n")}
            </pre>
          ) : null}
        </div>
      ) : null}

      {needsGeminiKey ? (
        <button
          className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-400/10 px-2 text-xs font-bold text-amber-200 hover:bg-amber-400/20"
          type="button"
          onClick={props.onOpenAiSettings}
        >
          <KeyRound size={13} />
          Add your Gemini API key to use Lyria
        </button>
      ) : null}

      <label className="grid gap-1 text-xs">
        <span className="font-bold text-slate-400">Describe the music</span>
        <textarea
          className="min-h-20 resize-y rounded-lg border border-white/10 bg-black/20 p-3 text-sm font-semibold text-white outline-none focus:border-violet-400"
          placeholder="lo-fi hip hop, mellow Rhodes piano, 85 BPM, dusty vinyl crackle, instrumental"
          value={prompt}
          disabled={generating}
          onChange={(event) => setPrompt(event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-xs">
        <span className="font-bold text-slate-400">Lyrics (optional)</span>
        <textarea
          className="min-h-16 resize-y rounded-lg border border-white/10 bg-black/20 p-3 text-sm font-semibold text-white outline-none focus:border-violet-400"
          placeholder={"[verse]\nWalking through the neon glow…"}
          value={lyrics}
          disabled={generating}
          onChange={(event) => setLyrics(event.target.value)}
        />
      </label>

      {engine === "acestep" ? (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <label className="grid gap-1 font-extrabold text-slate-400">
            <span>Duration (s)</span>
            <input
              className="h-9 w-full min-w-0 rounded-md border border-white/10 bg-black/20 px-2 text-white"
              type="number"
              min={5}
              max={240}
              value={durationSeconds}
              disabled={generating}
              onChange={(event) => setDurationSeconds(Number(event.target.value))}
            />
          </label>
          <label className="grid gap-1 font-extrabold text-slate-400">
            <span>Seed (blank = random)</span>
            <input
              className="h-9 w-full min-w-0 rounded-md border border-white/10 bg-black/20 px-2 text-white"
              type="number"
              min={0}
              value={seedText}
              disabled={generating}
              onChange={(event) => setSeedText(event.target.value)}
            />
          </label>
        </div>
      ) : null}

      <button
        className="inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.055] px-3 text-sm font-bold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        disabled={!canGenerate}
        onClick={() =>
          props.onGenerate({
            engine,
            prompt: prompt.trim(),
            lyrics,
            durationSeconds: Math.min(240, Math.max(5, durationSeconds || 30)),
            inferSteps: 27,
            guidanceScale: 15,
            seed: seedText.trim() === "" ? null : Math.max(0, Math.floor(Number(seedText)) || 0)
          })
        }
      >
        {generating ? <Loader2 className="animate-spin shrink-0" size={16} /> : <Music4 className="shrink-0" size={16} />}
        <span className="truncate">{generating ? "Generating…" : "Generate music"}</span>
      </button>

      {generating ? (
        <div className="grid gap-2">
          <div className="grid gap-1 rounded-lg border border-white/[0.08] p-3 text-xs">
            <span className="font-bold text-slate-300">
              {props.progress ? phaseLabels[props.progress.phase] : "Working…"}
            </span>
            {props.progress?.percent !== null && props.progress?.percent !== undefined ? (
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-violet-400 transition-[width]"
                  style={{ width: `${Math.min(100, Math.max(0, props.progress.percent))}%` }}
                />
              </div>
            ) : null}
          </div>
          <button
            className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-bold text-slate-300 hover:bg-white/10"
            type="button"
            onClick={props.onCancel}
          >
            <X size={13} /> Cancel
          </button>
        </div>
      ) : null}

      {props.lastLyrics ? (
        <div className="grid gap-1 rounded-lg border border-white/[0.08] p-3 text-xs">
          <span className="font-bold text-slate-400">Generated lyrics</span>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[0.68rem] leading-4 text-slate-300">
            {props.lastLyrics}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
