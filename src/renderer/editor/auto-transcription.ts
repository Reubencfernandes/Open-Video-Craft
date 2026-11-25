/**
 * One-shot automatic transcription for a project that was just recorded.
 *
 * The recorder opens the editor with `autoAnalyze=1`; the editor consumes that
 * flag exactly once (removing it from the URL) so a reload never overwrites
 * subtitles the user or the AI already produced.
 */

export interface AutoTranscriptionGate {
  /** The editor was opened right after a finished recording. */
  readonly requested: boolean;
  /** The persisted editor state has loaded and can be edited. */
  readonly editorReady: boolean;
  /** Audible clips that can carry speech. */
  readonly speechSourceCount: number;
  /** Subtitles already present in the project. */
  readonly subtitleCount: number;
  /** This editor session already started the automatic run. */
  readonly alreadyStarted: boolean;
}

export function shouldStartAutoTranscription(gate: AutoTranscriptionGate): boolean {
  return (
    gate.requested &&
    gate.editorReady &&
    !gate.alreadyStarted &&
    gate.speechSourceCount > 0 &&
    gate.subtitleCount === 0
  );
}

export interface AutoAnalyzeRequest {
  readonly requested: boolean;
  /** The search string without the one-shot flag. */
  readonly search: string;
}

/** Reads and strips the one-shot flag from a window search string. */
export function consumeAutoAnalyzeRequest(search: string): AutoAnalyzeRequest {
  const params = new URLSearchParams(search);
  if (params.get("autoAnalyze") !== "1") {
    return { requested: false, search };
  }

  params.delete("autoAnalyze");
  const rest = params.toString();
  return { requested: true, search: rest.length > 0 ? `?${rest}` : "" };
}
