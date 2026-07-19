import type {
  AudioLevelState,
  CameraContentTransform,
  ClipTransition,
  EditorDocument,
  EditorImportRecord,
  EditorMutation,
  EditorStateSnapshot,
  SpeedEffect,
  SubtitleSegment,
  SubtitleWord,
  TextOverlay,
  TimelineSegment,
  TrimRange,
  ZoomEffect
} from "./types";

/** Creates the safe, empty state used for new projects and failed restores. */
export function createDefaultEditorState(): EditorStateSnapshot {
  return {
    v: 2,
    timelineSegments: [], zoomEffects: [], speedEffects: [], transitions: [], subtitles: [], textOverlays: [],
    subtitleLanguage: null, subtitleStyle: "karaoke", layoutMode: "bubble",
    backgroundStyle: "real-world-6", activeBackgroundCategory: "image",
    cameraSize: 24, cameraPosition: "bottom-right", cameraShape: "circle",
    cameraBorderStyle: "light", cameraContentTransform: { x: 0, y: 0, scale: 100, mirrored: false },
    videoCornerStyle: "soft", screenPosition: { x: 0, y: 0, scale: 100 },
    screenAspectRatio: "auto", cameraFrame: { x: 72, y: 72, size: 24 },
    masterVolume: 100, audioLevels: {}, backgroundAudioIds: [],
    customBackgroundImportId: null, trimRange: { start: 0, end: 0 },
    previewQuality: "high", timelineZoom: 1, previewZoom: 1,
    pendingMediaImport: null, pendingMusicGeneration: null
  };
}

export function createEditorDocument(input: {
  state?: EditorStateSnapshot;
  imports?: EditorImportRecord[];
  now?: string;
} = {}): EditorDocument {
  const now = input.now ?? new Date().toISOString();
  return {
    schemaVersion: 2,
    revision: 0,
    savedAt: now,
    state: input.state ?? createDefaultEditorState(),
    imports: input.imports ?? [],
    lastMutation: { source: "editor", at: now, editId: null, summary: null }
  };
}

/**
 * Validates a persisted document and migrates the legacy outer schema without
 * changing its visible editor state. Returns null for unsupported data.
 */
export function parseEditorDocument(value: unknown): EditorDocument | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion === 2) {
    if (!Number.isInteger(value.revision) || (value.revision as number) < 0 ||
        typeof value.savedAt !== "string" || !validateEditorStateSnapshot(value.state) ||
        !Array.isArray(value.imports) || !value.imports.every(isEditorImportRecord) ||
        !isEditorMutation(value.lastMutation)) return null;
    return value as unknown as EditorDocument;
  }
  if (value.schemaVersion === 1 && typeof value.savedAt === "string" &&
      validateEditorStateSnapshot(value.state) && Array.isArray(value.imports) &&
      value.imports.every(isEditorImportRecord)) {
    return {
      schemaVersion: 2,
      revision: 0,
      savedAt: value.savedAt,
      state: value.state,
      imports: value.imports,
      lastMutation: { source: "editor", at: value.savedAt, editId: null, summary: "Migrated legacy editor state" }
    };
  }
  return null;
}

/** Runtime guard used at every renderer, main-process, and MCP trust boundary. */
export function validateEditorStateSnapshot(value: unknown): value is EditorStateSnapshot {
  if (!isRecord(value) || value.v !== 2) return false;
  return isArrayOf(value.timelineSegments, isTimelineSegment) &&
    isArrayOf(value.zoomEffects, isZoomEffect) && isArrayOf(value.speedEffects, isSpeedEffect) &&
    isArrayOf(value.transitions ?? [], isClipTransition) &&
    isArrayOf(value.subtitles, isSubtitleSegment) &&
    isArrayOf(value.textOverlays ?? [], isTextOverlay) &&
    (value.subtitleLanguage === null || typeof value.subtitleLanguage === "string") &&
    oneOf(value.subtitleStyle, ["clean", "karaoke", "boxed", "pop"]) &&
    oneOf(value.layoutMode, ["screen-only", "camera-only", "bubble", "bubble-fill", "presenter", "side-by-side", "side-overlap"]) &&
    oneOf(value.backgroundStyle, ["real-world-1", "real-world-2", "real-world-3", "real-world-4", "real-world-5", "real-world-6", "gradient-1", "gradient-2", "gradient-3", "animated-1", "animated-2", "animated-3", "custom"]) &&
    oneOf(value.activeBackgroundCategory, ["animated", "image", "gradient"]) && finite(value.cameraSize) &&
    oneOf(value.cameraPosition, ["top-left", "top-center", "top-right", "middle-left", "middle-center", "middle-right", "bottom-left", "bottom-center", "bottom-right"]) &&
    oneOf(value.cameraShape, ["circle", "rounded", "square"]) &&
    oneOf(value.cameraBorderStyle, ["none", "light", "accent"]) &&
    isCameraContentTransform(value.cameraContentTransform) && oneOf(value.videoCornerStyle, ["flat", "soft", "round"]) &&
    isXYZ(value.screenPosition, ["x", "y", "scale"]) && oneOf(value.screenAspectRatio, ["auto", "16:9", "16:10", "4:3"]) &&
    isXYZ(value.cameraFrame, ["x", "y", "size"]) && finite(value.masterVolume) && isAudioLevels(value.audioLevels) &&
    isArrayOf(value.backgroundAudioIds, (item): item is string => typeof item === "string") &&
    (value.customBackgroundImportId === null || typeof value.customBackgroundImportId === "string") &&
    isRange(value.trimRange) &&
    (value.previewQuality === undefined || oneOf(value.previewQuality, ["high", "low"])) &&
    (value.timelineZoom === undefined || (finite(value.timelineZoom) && value.timelineZoom >= 1 && value.timelineZoom <= 10)) &&
    (value.previewZoom === undefined || (finite(value.previewZoom) && value.previewZoom >= 0.65 && value.previewZoom <= 1.6)) &&
    (value.pendingMediaImport === undefined || value.pendingMediaImport === null || isPendingMediaImport(value.pendingMediaImport)) &&
    (value.pendingMusicGeneration === undefined || value.pendingMusicGeneration === null || isPendingMusicGeneration(value.pendingMusicGeneration));
}

export function isSubtitleSegment(value: unknown): value is SubtitleSegment {
  return hasTimedId(value) && typeof value.text === "string" &&
    (value.words === undefined || isArrayOf(value.words, (word): word is SubtitleWord =>
      isRecord(word) && typeof word.text === "string" && finite(word.start) && finite(word.end) && word.end >= word.start));
}

export function isTextOverlay(value: unknown): value is TextOverlay {
  return hasTimedId(value) && typeof value.text === "string" &&
    finite(value.x) && value.x >= 0 && value.x <= 100 &&
    finite(value.y) && value.y >= 0 && value.y <= 100 &&
    finite(value.size) && value.size >= 12 && value.size <= 240 &&
    typeof value.color === "string" && /^#[0-9a-f]{6}$/i.test(value.color) &&
    [400, 600, 700, 800].includes(value.weight as number) &&
    oneOf(value.animation, ["none", "fade", "pop", "slide-up"]);
}

function isClipTransition(value: unknown): value is ClipTransition {
  return isRecord(value) && typeof value.id === "string" &&
    typeof value.fromSegmentId === "string" && typeof value.toSegmentId === "string" &&
    oneOf(value.type, ["crossfade", "fade-black", "slide-left", "wipe-left"]) &&
    finite(value.duration) && value.duration >= 0.1 && value.duration <= 2;
}

export function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isEditorImportRecord(value: unknown): value is EditorImportRecord {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" &&
    oneOf(value.kind, ["video", "audio", "image"]) && typeof value.extension === "string" &&
    (value.duration === null || (finite(value.duration) && value.duration >= 0)) && typeof value.relativePath === "string";
}

function isPendingMediaImport(value: unknown): boolean {
  return isRecord(value) && typeof value.requestId === "string" && value.requestId.length > 0 &&
    Array.isArray(value.paths) && value.paths.length > 0 && value.paths.every((item) => typeof item === "string" && item.length > 0) &&
    oneOf(value.placement, ["media-bin", "timeline", "background-audio", "custom-background"]) &&
    finite(value.timelineStart) && value.timelineStart >= 0;
}

function isPendingMusicGeneration(value: unknown): boolean {
  return isRecord(value) && typeof value.requestId === "string" && value.requestId.length > 0 &&
    oneOf(value.engine, ["lyria-clip", "lyria-pro"]) &&
    typeof value.prompt === "string" && value.prompt.trim().length > 0 &&
    typeof value.lyrics === "string";
}

function isEditorMutation(value: unknown): value is EditorMutation {
  return isRecord(value) && oneOf(value.source, ["editor", "agent"]) && typeof value.at === "string" &&
    (value.editId === null || typeof value.editId === "string") && (value.summary === null || typeof value.summary === "string");
}

function isTimelineSegment(value: unknown): value is TimelineSegment {
  return hasTimedId(value) && typeof value.itemId === "string" && oneOf(value.track, ["video", "audio"]) &&
    Number.isInteger(value.lane) && finite(value.sourceStart);
}

function isZoomEffect(value: unknown): value is ZoomEffect {
  return hasTimedId(value) && oneOf(value.speed, ["slow", "medium", "fast"]) &&
    (value.easing === undefined || oneOf(value.easing, ["linear", "ease-in", "ease-out", "ease-in-out", "custom"])) &&
    finite(value.scale) && finite(value.targetX) && finite(value.targetY) &&
    (value.bezier === undefined || (Array.isArray(value.bezier) && value.bezier.length === 4 && value.bezier.every(finite)));
}

function isSpeedEffect(value: unknown): value is SpeedEffect {
  return hasTimedId(value) && [1, 2, 3, 4, 5].includes(value.rate as number);
}

function hasTimedId(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value.id === "string" && finite(value.start) && finite(value.end) && value.end >= value.start;
}

function isCameraContentTransform(value: unknown): value is CameraContentTransform {
  return isXYZ(value, ["x", "y", "scale"]) && typeof value.mirrored === "boolean";
}

function isAudioLevels(value: unknown): value is AudioLevelState {
  return isRecord(value) && Object.values(value).every((level) =>
    isRecord(level) && finite(level.volume) && typeof level.muted === "boolean");
}

function isRange(value: unknown): value is TrimRange {
  return isRecord(value) && finite(value.start) && finite(value.end);
}

function isXYZ(value: unknown, keys: string[]): value is Record<string, number> {
  return isRecord(value) && keys.every((key) => finite(value[key]));
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function isArrayOf<T>(value: unknown, predicate: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(predicate);
}
