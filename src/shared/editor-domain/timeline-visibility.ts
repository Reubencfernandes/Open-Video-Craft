/**
 * Which video clip is on screen over time and where it sits in the frame (S14, S25).
 *
 * Recorded sources live on separate overlapping channels. The canvas keeps one
 * *base* picture (a recorded screen or an imported video) and puts the *camera*
 * above it; within each role the lowest visible channel wins and hidden or
 * trimmed clips fall through to the next one. The exporter must see exactly the
 * same layers, geometry and source offsets, or the exported file would either
 * concatenate overlapping channels into a video twice as long as the edit or
 * lose the webcam entirely.
 *
 * `resolveVisibleVideoRanges` turns overlapping channel clips into one ordered,
 * non-overlapping sequence with real gaps where nothing is visible;
 * `resolveCompositionLayers`/`resolveCompositionWindows` resolve the base and
 * camera layers at a moment and across the whole timeline.
 */
import type {
  CameraBorderStyle,
  CameraClipStyle,
  CameraFrame,
  CameraShape,
  LayoutMode,
  ScreenAspectRatio,
  TimelineSegment
} from "./types";

export interface VisibleVideoRange {
  readonly segment: TimelineSegment;
  readonly start: number;
  readonly end: number;
}

function boundaries(segments: readonly TimelineSegment[]): number[] {
  const times = new Set<number>();
  for (const segment of segments) {
    times.add(segment.start);
    times.add(segment.end);
  }
  return [...times].sort((first, second) => first - second);
}

function isVisible(segment: TimelineSegment): boolean {
  return segment.track === "video" && segment.hidden !== true && segment.end > segment.start;
}

/**
 * Cuts the video channel clips into the ranges that are actually rendered. The
 * winner is the lowest lane; ties are broken by id so the result is stable.
 */
export function resolveVisibleVideoRanges(
  segments: readonly TimelineSegment[]
): VisibleVideoRange[] {
  const video = segments.filter(isVisible);
  if (video.length === 0) return [];

  const result: VisibleVideoRange[] = [];
  const times = boundaries(video);
  for (let index = 0; index < times.length - 1; index += 1) {
    const start = times[index];
    const end = times[index + 1];
    if (end - start <= 0.0005) continue;

    let winner: TimelineSegment | null = null;
    for (const segment of video) {
      if (segment.start > start || segment.end < end) continue;
      if (winner === null || segment.lane < winner.lane ||
        (segment.lane === winner.lane && segment.id.localeCompare(winner.id) < 0)) {
        winner = segment;
      }
    }
    if (winner === null) continue;

    const previous = result[result.length - 1];
    if (previous && previous.segment.id === winner.id && Math.abs(previous.end - start) < 0.0005) {
      result[result.length - 1] = { segment: previous.segment, start: previous.start, end };
      continue;
    }
    result.push({ segment: winner, start, end });
  }

  return result;
}

/** Timeline position of a moment inside the resolved sequence (gaps included). */
export function visibleRangeOffset(
  ranges: readonly VisibleVideoRange[],
  target: number
): number | null {
  let offset = 0;
  for (const range of ranges) {
    const length = range.end - range.start;
    if (target >= range.start && target < range.end) {
      return offset + (target - range.start);
    }
    offset += length;
  }
  return null;
}

/**
 * Role a channel plays in the composition. The base layer is the recorded
 * screen/window or an imported video; the camera layer is a webcam.
 */
export type CompositionRole = "base" | "camera";

/** Minimal clip shape shared by the canvas, the playback clock and the exporter. */
export interface CompositionClip {
  readonly id: string;
  readonly role: CompositionRole;
  readonly lane: number;
  readonly start: number;
  readonly end: number;
  readonly hidden?: boolean;
}

export interface CompositionLayers<T extends CompositionClip> {
  readonly base: T | null;
  readonly camera: T | null;
  /** Base picture when there is one, otherwise the webcam alone. */
  readonly primary: T | null;
}

export interface CompositionWindow<T extends CompositionClip> {
  readonly start: number;
  readonly end: number;
  readonly base: T | null;
  readonly camera: T | null;
}

function isClipVisibleAt(clip: CompositionClip, time: number): boolean {
  return clip.hidden !== true && clip.end > clip.start && time >= clip.start && time < clip.end;
}

/** Lowest visible lane wins; ties are broken by id so the result is stable. */
function pickLowestVisible<T extends CompositionClip>(clips: readonly T[]): T | null {
  let winner: T | null = null;
  for (const clip of clips) {
    if (
      winner === null ||
      clip.lane < winner.lane ||
      (clip.lane === winner.lane && clip.id.localeCompare(winner.id) < 0)
    ) {
      winner = clip;
    }
  }
  return winner;
}

/**
 * Layers shown at `time`. The selected webcam clip wins over the lowest channel
 * so the owner can choose which webcam the Layout presets compose; every other
 * case falls back to the lowest visible channel of each role.
 */
export function resolveCompositionLayers<T extends CompositionClip>(
  clips: readonly T[],
  time: number,
  preferredCameraClipId: string | null = null
): CompositionLayers<T> {
  const visible = clips.filter((clip) => isClipVisibleAt(clip, time));
  const base = pickLowestVisible(visible.filter((clip) => clip.role === "base"));
  const cameras = visible.filter((clip) => clip.role === "camera");
  const preferred = preferredCameraClipId === null
    ? null
    : cameras.find((clip) => clip.id === preferredCameraClipId) ?? null;
  const camera = preferred ?? pickLowestVisible(cameras);

  return { base, camera, primary: base ?? camera };
}

/**
 * Layers for every stretch of the timeline. Windows are split where a visible
 * layer changes or disappears, and neighbouring windows showing the same layers
 * are merged, so the exporter renders exactly what the canvas shows.
 */
export function resolveCompositionWindows<T extends CompositionClip>(
  clips: readonly T[],
  preferredCameraClipId: string | null = null
): CompositionWindow<T>[] {
  const visible = clips.filter((clip) => clip.hidden !== true && clip.end > clip.start);
  if (visible.length === 0) return [];

  const times = [...new Set(visible.flatMap((clip) => [clip.start, clip.end]))]
    .sort((first, second) => first - second);
  const windows: Array<{ start: number; end: number; base: T | null; camera: T | null }> = [];
  for (let index = 0; index < times.length - 1; index += 1) {
    const start = times[index];
    const end = times[index + 1];
    if (end - start <= 0.0005) continue;

    const { base, camera } = resolveCompositionLayers(
      visible,
      start + (end - start) / 2,
      preferredCameraClipId
    );
    if (!base && !camera) continue;

    const previous = windows[windows.length - 1];
    if (previous && previous.base?.id === base?.id && previous.camera?.id === camera?.id) {
      previous.end = end;
      continue;
    }
    windows.push({ start, end, base, camera });
  }

  return windows;
}

/** Border painted inside the webcam box, resolved once for both surfaces. */
export interface CameraFrameBorder {
  /** Six hex digits: the preview writes `#rrggbb`, FFmpeg writes `0xrrggbb`. */
  readonly colorHex: string;
  /** Thickness in preview CSS pixels; the exporter scales it with the frame. */
  readonly cssWidth: number;
}

export interface CameraBorderInput {
  readonly layoutMode: LayoutMode;
  readonly borderStyle: CameraBorderStyle;
}

/**
 * Border around the webcam (S1). The preview paints it as a CSS border inside
 * the camera box and the exporter burns the same colour and thickness into the
 * file, so the border chosen in Layout survives the export. The split preset
 * paints the webcam edge to edge and carries no border on either surface.
 */
export function resolveCameraBorder(input: CameraBorderInput): CameraFrameBorder | null {
  if (input.borderStyle === "none" || input.layoutMode === "side-by-side") return null;
  return input.borderStyle === "accent"
    ? { colorHex: "f9a916", cssWidth: 3 }
    : { colorHex: "ffffff", cssWidth: 4 };
}

/** Webcam shape and border in force for one stretch of the timeline. */
export interface ResolvedCameraStyle {
  readonly shape: CameraShape;
  readonly border: CameraBorderStyle;
}

/**
 * Camera style in force (S5). A clip may restyle the webcam while it is on
 * screen; each property it leaves out keeps the project value, so the preview
 * and the exported file always resolve the same shape and border.
 */
export function resolveCameraStyle(
  clipStyle: CameraClipStyle | undefined,
  projectStyle: ResolvedCameraStyle
): ResolvedCameraStyle {
  return {
    shape: clipStyle?.shape ?? projectStyle.shape,
    border: clipStyle?.border ?? projectStyle.border
  };
}

/** A rectangle in percent of the composition frame. */
export interface CompositionRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** "contain" letterboxes the layer; "cover" fills the frame and crops it. */
export type CompositionFit = "contain" | "cover";

export interface CompositionLayerFrame {
  readonly frame: CompositionRect;
  readonly fit: CompositionFit;
}

/** Where each layer sits for a layout preset; null means the layer is hidden. */
export interface CompositionLayout {
  readonly base: CompositionLayerFrame | null;
  readonly camera: CompositionLayerFrame | null;
}

export interface CompositionLayoutInput {
  readonly layoutMode: LayoutMode;
  readonly screenAspectRatio?: ScreenAspectRatio;
  /** Intrinsic aspect ratio (w/h) of the base picture, once known. */
  readonly screenIntrinsicAspect?: number | null;
  readonly cameraFrame?: CameraFrame;
  /** Composition frame width / height, so the webcam box stays square. */
  readonly frameAspect?: number;
}

const compositionFrameAspect = 16 / 9;
const fullFrame: CompositionRect = { x: 0, y: 0, width: 100, height: 100 };
const defaultCameraFrame: CameraFrame = { x: 72, y: 72, size: 24 };

/**
 * Geometry of every preset. The canvas and the exporter both consume this so a
 * preset renders the same picture in the preview and in the exported file.
 */
export function getCompositionLayout(input: CompositionLayoutInput): CompositionLayout {
  const aspect = screenAspectValue(
    input.screenAspectRatio ?? "auto",
    input.screenIntrinsicAspect ?? null
  );
  const camera = cameraFrameRect(
    input.cameraFrame ?? defaultCameraFrame,
    input.frameAspect ?? compositionFrameAspect
  );

  switch (input.layoutMode) {
    case "camera-only":
      return { base: null, camera: { frame: fullFrame, fit: "cover" } };
    case "screen-only":
      return { base: { frame: screenFrameFor("screen-only", aspect), fit: "contain" }, camera: null };
    case "side-by-side":
      return {
        base: { frame: { x: 40, y: 0, width: 60, height: 100 }, fit: "cover" },
        camera: { frame: { x: 0, y: 0, width: 40, height: 100 }, fit: "cover" }
      };
    case "bubble-fill":
      return { base: { frame: fullFrame, fit: "cover" }, camera };
    case "bubble":
    case "presenter":
    case "side-overlap":
    default:
      return { base: { frame: screenFrameFor(input.layoutMode, aspect), fit: "contain" }, camera };
  }
}

function screenFrameFor(layoutMode: LayoutMode, aspect: number): CompositionRect {
  const bounds = screenFrameBounds(layoutMode);
  // The filled-screen preset uses the composition bounds themselves. Fitting an
  // aspect-ratio frame inside the regular inset bounds only made object-fit crop
  // the video inside a smaller rectangle, which looked like the normal bubble.
  if (layoutMode === "bubble-fill") return bounds;

  const width = Math.min(bounds.width, (bounds.height * aspect) / compositionFrameAspect);
  const height = (width * compositionFrameAspect) / aspect;
  return {
    x: bounds.x + (bounds.width - width) / 2,
    y: bounds.y + (bounds.height - height) / 2,
    width,
    height
  };
}

function screenFrameBounds(layoutMode: LayoutMode): CompositionRect {
  switch (layoutMode) {
    case "bubble-fill":
      return fullFrame;
    case "presenter":
      return { x: 6, y: 15, width: 60, height: 62 };
    case "side-overlap":
      return { x: 36, y: 10, width: 60, height: 76 };
    default:
      return { x: 4, y: 6, width: 92, height: 88 };
  }
}

function screenAspectValue(aspectRatio: ScreenAspectRatio, intrinsicAspect: number | null): number {
  switch (aspectRatio) {
    // "auto" sizes the frame to the recording itself so the frame (and the
    // selection border drawn on it) hugs the visible picture with no letterbox
    // gap. Falls back to 16:9 until the video metadata is known.
    case "auto":
      return intrinsicAspect && Number.isFinite(intrinsicAspect) && intrinsicAspect > 0
        ? intrinsicAspect
        : compositionFrameAspect;
    case "16:10":
      return 16 / 10;
    case "4:3":
      return 4 / 3;
    case "16:9":
    default:
      return compositionFrameAspect;
  }
}

/** Square webcam box in frame percentages, matching the canvas bubble. */
function cameraFrameRect(frame: CameraFrame, frameAspect: number): CompositionLayerFrame {
  const width = clampPercent(frame.size, 12, 64);
  const height = width * frameAspect;
  return {
    frame: {
      x: clampPercent(frame.x, 0, 100),
      y: clampPercent(frame.y, 0, 100),
      width,
      height
    },
    fit: "cover"
  };
}

function clampPercent(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}
