/**
 * Transcript-driven informational callouts (S3).
 *
 * Turns timestamped speech into a small set of animated boxed overlays placed at
 * the moment they are talked about. The generator is pure and deterministic so
 * the editor, the MCP assistant and the tests all agree on the result: the same
 * transcript always produces the same boxes.
 *
 * Selection is breadth-first, not keyword magic: informative cues are ranked by
 * how much they say, then spaced across the timeline so a video never becomes a
 * wall of boxes.
 */
import type { CalloutBoxStyle, TextAnimation, TextOverlay } from "./types";

export interface TranscriptCalloutCue {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export interface TranscriptCalloutOptions {
  /** Hard cap on generated boxes. */
  readonly maxCallouts?: number;
  /** Minimum distance between two boxes, so they never crowd the frame. */
  readonly minGapSeconds?: number;
  /** How long a box stays on screen. */
  readonly displaySeconds?: number;
  readonly animation?: TextAnimation;
  /** Timeline length; a box never ends after it. */
  readonly durationSeconds?: number;
}

export const defaultCalloutBox: CalloutBoxStyle = {
  backgroundColor: "#111827",
  backgroundOpacity: 88,
  borderColor: "#f9a916",
  borderWidth: 3,
  borderRadius: 14,
  padding: 22,
  titleColor: "#f9a916",
  titleSize: 34
};

const DEFAULTS = {
  maxCallouts: 6,
  minGapSeconds: 8,
  displaySeconds: 4,
  animation: "pop" as TextAnimation
};

const MIN_WORDS = 3;
/** Words that make a sentence a poor box: pure filler or a fragment. */
const WEAK_OPENERS = ["um", "uh", "so", "and", "but", "then", "okay", "ok", "yeah", "right"];

function words(text: string): string[] {
  return text
    .replace(/\s+/gu, " ")
    .trim()
    .split(" ")
    .filter((word) => word.length > 0);
}

/** A short heading built from the meaningful words of the cue. */
export function calloutTitle(text: string, maxWords = 7): string {
  const list = words(text);
  const start = WEAK_OPENERS.includes((list[0] ?? "").toLowerCase().replace(/[^\p{L}]/gu, "")) ? 1 : 0;
  return list.slice(start, start + maxWords).join(" ").replace(/[.,;:]+$/u, "");
}

/** A box is worth showing when the cue actually says something. */
export function isInformativeCue(cue: TranscriptCalloutCue): boolean {
  const list = words(cue.text);
  if (list.length < MIN_WORDS) return false;
  const letters = cue.text.replace(/[^\p{L}]/gu, "");
  return letters.length >= 12;
}

function clampToTimeline(value: number, duration: number | undefined): number {
  if (duration === undefined || !Number.isFinite(duration) || duration <= 0) {
    return Math.max(0, value);
  }
  return Math.min(duration, Math.max(0, value));
}

/**
 * Builds the callout list. Candidates are ranked by how much they say, and a
 * candidate is dropped when it would sit too close to an already accepted one.
 */
export function generateTranscriptCallouts(
  cues: readonly TranscriptCalloutCue[],
  options: TranscriptCalloutOptions = {}
): TextOverlay[] {
  const maxCallouts = options.maxCallouts ?? DEFAULTS.maxCallouts;
  const minGap = options.minGapSeconds ?? DEFAULTS.minGapSeconds;
  const display = options.displaySeconds ?? DEFAULTS.displaySeconds;

  const ranked = cues
    .filter(isInformativeCue)
    .map((cue, index) => ({ cue, index, score: words(cue.text).length }))
    .sort((first, second) => second.score - first.score || first.cue.start - second.cue.start);

  const accepted: TranscriptCalloutCue[] = [];
  for (const candidate of ranked) {
    if (accepted.length >= maxCallouts) break;
    const tooClose = accepted.some(
      (existing) => Math.abs(existing.start - candidate.cue.start) < minGap
    );
    if (!tooClose) accepted.push(candidate.cue);
  }

  return accepted
    .sort((first, second) => first.start - second.start)
    .map((cue, index) => {
      const start = clampToTimeline(cue.start, options.durationSeconds);
      const cueLength = Math.max(0.5, cue.end - cue.start);
      const end = clampToTimeline(start + Math.max(display, cueLength), options.durationSeconds);
      return {
        id: `callout-${index + 1}`,
        start: Math.round(start * 1000) / 1000,
        end: Math.round(Math.max(start + 1, end) * 1000) / 1000,
        text: words(cue.text).slice(0, 24).join(" "),
        title: calloutTitle(cue.text),
        box: defaultCalloutBox,
        x: 50,
        y: 80,
        size: 34,
        color: "#ffffff",
        weight: 700,
        opacity: 100,
        animation: options.animation ?? DEFAULTS.animation
      } satisfies TextOverlay;
    });
}
