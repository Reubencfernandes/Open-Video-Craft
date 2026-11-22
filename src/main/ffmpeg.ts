/**
 * FFmpeg integration: resolving the bundled binary (asar-unpacked), remuxing
 * chunked WebM recordings so they seek, converting mic/system audio to WAV,
 * and running the export encode.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import {
  appendCalloutBoxFilter,
  createCalloutBoxDrawboxFilter
} from "./callout-filter";
import type { ExportResolution, ExportVideoFormat } from "../shared/types";
import { loadFontMetrics, wrapTextToWidth } from "./font-metrics";
import { resolveOverlayFont } from "./overlay-fonts";
import {
  calculateExportPercent,
  calculateExportTimeoutMs,
  parseFfmpegProgressSeconds
} from "./ffmpeg-progress";

export interface ExportProcessControl {
  signal?: AbortSignal;
  onProgress?: (percent: number, message?: string) => void;
}

export interface ExportVideoJob {
  videoPath: string;
  audioTracks: Array<{ path: string; volume: number }>;
  outputPath: string;
  format: ExportVideoFormat;
  resolution: ExportResolution;
  trimStart: number;
  trimEnd: number | null;
  sourceAudioVolume: number;
  preserveSourceAudio: boolean;
  subtitlePath?: string | null;
  /** Timeline text overlays, already rebased to output time. */
  textOverlays?: TimelineCompositionTextOverlay[];
}

export interface TimelineCompositionVideoSegment {
  id?: string;
  path: string;
  kind: "video" | "image";
  start: number;
  end: number;
  sourceStart: number;
  volume: number;
  hasAudio: boolean;
  cleanupFilter?: string;
}

export interface TimelineCompositionTransition {
  fromSegmentId: string;
  toSegmentId: string;
  type: "crossfade" | "fade-black" | "slide-left" | "wipe-left";
  duration: number;
}

export interface TimelineCompositionZoomEffect {
  start: number;
  end: number;
  speed: "slow" | "medium" | "fast";
  easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out" | "custom";
  bezier?: [number, number, number, number];
  scale: number;
  targetX: number;
  targetY: number;
}

export interface TimelineCompositionSpeedEffect {
  start: number;
  end: number;
  rate: 1 | 1.25 | 1.5 | 2 | 3 | 4 | 5;
}

export interface TimelineCompositionTextOverlay {
  id?: string;
  start: number;
  end: number;
  text: string;
  title?: string;
  box?: {
    backgroundColor: string;
    backgroundOpacity: number;
    borderColor: string;
    borderWidth: number;
    borderRadius: number;
    padding: number;
    titleColor: string;
    titleSize: number;
  };
  x: number;
  y: number;
  size: number;
  color: string;
  fontFamily?: "sans" | "rounded" | "serif" | "mono";
  opacity?: number;
  weight: 400 | 600 | 700 | 800;
  animation: "none" | "fade" | "pop" | "slide-up" | "fade-in-out" | "pop-in-out" | "slide-in-out";
}

export interface TimelineCompositionAudioSegment {
  path: string;
  start: number;
  end: number;
  sourceStart: number;
  volume: number;
  cleanupFilter?: string;
  /** Audio-track music stays real-time even when the picture is sped up. */
  speedAffected?: boolean;
}

export interface TimelineCompositionJob {
  videoSegments: TimelineCompositionVideoSegment[];
  audioSegments: TimelineCompositionAudioSegment[];
  outputPath: string;
  format: ExportVideoFormat;
  resolution: ExportResolution;
  trimStart: number;
  trimEnd: number | null;
  subtitlePath?: string | null;
  transitions?: TimelineCompositionTransition[];
  zoomEffects?: TimelineCompositionZoomEffect[];
  speedEffects?: TimelineCompositionSpeedEffect[];
  textOverlays?: TimelineCompositionTextOverlay[];
  background?: { imagePath: string };
}

type CompositionPiece = {
  inputIndex: number;
  duration: number;
  gap: boolean;
  segment?: TimelineCompositionVideoSegment;
};

// ffmpeg-static reports a path inside app.asar, but asar archives are files,
// so spawning from them fails with ENOTDIR. The binary is asarUnpack'ed next
// to the archive; point at that copy when packaged.
export function toUnpackedPath(binaryPath: string): string {
  return binaryPath.replace(/([/\\])app\.asar([/\\])/, "$1app.asar.unpacked$2");
}

function resolveBundledBinaryPath(binaryPath: string, binaryName: string): string {
  const unpackedPath = toUnpackedPath(binaryPath);

  if (unpackedPath !== binaryPath && !existsSync(unpackedPath)) {
    throw new Error(
      `${binaryName} was resolved inside app.asar, but the unpacked binary was not found at "${unpackedPath}". Check the electron-builder asarUnpack configuration.`
    );
  }

  return unpackedPath;
}

export function resolveFfmpegPath(): string {
  if (!ffmpegStatic) {
    throw new Error("No FFmpeg binary is available for this platform.");
  }

  return resolveBundledBinaryPath(ffmpegStatic, "FFmpeg");
}

// MediaRecorder writes a headerless chunk stream: no duration, no seek cues.
// A stream-copy remux rewrites the container so <video> elements can report a
// finite duration and seek reliably. The original file is replaced in place.
export async function remuxWebm(filePath: string): Promise<void> {
  const inputStats = await fs.stat(filePath).catch(() => null);

  if (!inputStats || inputStats.size === 0) {
    return;
  }

  const tempPath = `${filePath}.remux.webm`;

  try {
    await runProcess(resolveFfmpegPath(), ["-y", "-i", filePath, "-c", "copy", tempPath]);

    const outputStats = await fs.stat(tempPath).catch(() => null);
    if (!outputStats || outputStats.size === 0) {
      throw new Error("Remuxing produced an empty file.");
    }

    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

// A PCM WAV header is ~44 bytes; a track carrying any real audio is far larger
// (48 kHz stereo 16-bit is ~192 KB/s). When a captured stream produced no
// samples (e.g. a system-audio loopback track the OS opened but never fed),
// ffmpeg still writes a header-only WAV. Registering that as a playable track
// makes the editor fail with "no supported sources", so treat it as no audio.
const minimumMeaningfulWavBytes = 1024;

export async function convertWebmAudioToWav(inputPath: string, outputPath: string): Promise<number> {
  const inputStats = await fs.stat(inputPath).catch(() => null);

  if (!inputStats || inputStats.size === 0) {
    return 0;
  }

  await runProcess(resolveFfmpegPath(), [
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-acodec",
    "pcm_s16le",
    "-ar",
    "48000",
    "-ac",
    "2",
    outputPath
  ]);

  const outputStats = await fs.stat(outputPath).catch(() => null);
  const bytes = outputStats?.size ?? 0;

  if (bytes < minimumMeaningfulWavBytes) {
    await fs.rm(outputPath, { force: true }).catch(() => undefined);
    return 0;
  }

  return bytes;
}

export async function exportVideo(
  job: ExportVideoJob,
  control: ExportProcessControl = {}
): Promise<number> {
  const outputDuration =
    job.trimEnd && job.trimEnd > job.trimStart ? job.trimEnd - job.trimStart : null;
  const durationSeconds = outputDuration ?? (await probeMediaDurationMs(job.videoPath) ?? 0) / 1000;

  if (canStreamCopy(job)) {
    await runProcess(resolveFfmpegPath(), [
      "-y",
      "-i",
      job.videoPath,
      "-map",
      "0",
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      job.outputPath
    ], { ...control, durationSeconds });
    return (await fs.stat(job.outputPath)).size;
  }

  const args: string[] = ["-y"];

  addInput(args, job.videoPath, job.trimStart);

  for (const track of job.audioTracks) {
    addInput(args, track.path, job.trimStart);
  }

  if (outputDuration) {
    args.push("-t", formatFfmpegNumber(outputDuration));
  }

  const sourceSize = job.textOverlays?.length && job.resolution === "source"
    ? await probeMediaSize(job.videoPath)
    : null;
  const videoFilter = createVideoFilter(
    job.resolution,
    job.subtitlePath,
    job.textOverlays,
    sourceSize
  );
  const sourceHasAudio = job.preserveSourceAudio && await mediaHasAudio(job.videoPath);
  const audioInputs = [
    ...(sourceHasAudio
      ? [{ inputIndex: 0, volume: job.sourceAudioVolume }]
      : []),
    ...job.audioTracks.map((track, index) => ({ inputIndex: index + 1, volume: track.volume }))
  ];

  if (audioInputs.length > 1) {
    const audioFilters = audioInputs
      .map((input, index) =>
        `[${input.inputIndex}:a]volume=${formatFfmpegNumber(clampVolume(input.volume))}[a${index}]`
      )
      .join(";");
    const mixInputs = audioInputs.map((_input, index) => `[a${index}]`).join("");
    args.push(
      "-filter_complex",
      `${audioFilters};${mixInputs}amix=inputs=${audioInputs.length}:duration=longest:dropout_transition=0:normalize=0[aout]`,
      "-map",
      "0:v:0",
      "-map",
      "[aout]"
    );
  } else if (audioInputs.length === 1) {
    const input = audioInputs[0];
    args.push(
      "-map",
      "0:v:0",
      "-map",
      `${input.inputIndex}:a${input.inputIndex === 0 ? "?" : ":0"}`,
      "-af",
      `volume=${formatFfmpegNumber(clampVolume(input.volume))}`
    );
  } else {
    args.push("-map", "0:v:0");
    args.push("-an");
  }

  if (videoFilter) {
    args.push("-vf", videoFilter);
  }

  args.push(...await createCodecArgs(job.format), job.outputPath);
  await runProcess(resolveFfmpegPath(), args, {
    ...control,
    durationSeconds
  });

  const outputStats = await fs.stat(job.outputPath);
  return outputStats.size;
}

/** Render the saved timeline, including reordered clips, gaps and delayed audio. */
export async function exportTimelineComposition(
  job: TimelineCompositionJob,
  control: ExportProcessControl = {}
): Promise<number> {
  const videoSegments = [...job.videoSegments].sort((a, b) => a.start - b.start);
  if (videoSegments.length === 0) throw new Error("The timeline has no video clips to export.");
  const timelineEnd = videoSegments.reduce((max, item) => Math.max(max, item.end), 0);
  const [width, height] = getResolutionDimensions(job.resolution) ?? [1920, 1080];
  const args: string[] = ["-y"];
  const pieces: CompositionPiece[] = [];
  let inputIndex = 0;
  const backgroundPath = job.background?.imagePath;
  if (backgroundPath) {
    args.push("-loop", "1", "-t", formatFfmpegNumber(Math.max(0.1, timelineEnd)), "-i", backgroundPath);
    inputIndex = 1;
  }
  let cursor = 0;
  for (const segment of videoSegments) {
    if (segment.start > cursor + 0.01) {
      const duration = segment.start - cursor;
      args.push("-f", "lavfi", "-t", formatFfmpegNumber(duration), "-i", `color=c=black:s=${width}x${height}:r=30`);
      pieces.push({ inputIndex: inputIndex++, duration, gap: true });
    }
    const duration = segment.end - segment.start;
    if (segment.kind === "image") {
      args.push("-loop", "1", "-t", formatFfmpegNumber(duration), "-i", segment.path);
    } else {
      if (segment.sourceStart > 0) args.push("-ss", formatFfmpegNumber(segment.sourceStart));
      args.push("-t", formatFfmpegNumber(duration), "-i", segment.path);
    }
    pieces.push({ inputIndex: inputIndex++, duration, gap: false, segment });
    cursor = Math.max(cursor, segment.end);
  }
  if (cursor < timelineEnd) {
    const duration = timelineEnd - cursor;
    args.push("-f", "lavfi", "-t", formatFfmpegNumber(duration), "-i", `color=c=black:s=${width}x${height}:r=30`);
    pieces.push({ inputIndex: inputIndex++, duration, gap: true });
  }

  const transitions = job.transitions ?? [];
  const audioInputs: Array<{
    inputIndex: number;
    start: number;
    duration: number;
    volume: number;
    fadeIn: number;
    fadeOut: number;
    cleanupFilter?: string;
    speedAffected: boolean;
  }> = [];
  for (let pieceIndex = 0; pieceIndex < pieces.length; pieceIndex += 1) {
    const piece = pieces[pieceIndex];
    if (!piece.gap && piece.segment?.hasAudio) {
      audioInputs.push({
        inputIndex: piece.inputIndex,
        start: piece.segment.start,
        duration: piece.duration,
        volume: piece.segment.volume,
        cleanupFilter: piece.segment.cleanupFilter,
        fadeIn: (getTransitionBetween(pieces[pieceIndex - 1], piece, transitions)?.duration ?? 0) / 2,
        fadeOut: (getTransitionBetween(piece, pieces[pieceIndex + 1], transitions)?.duration ?? 0) / 2,
        speedAffected: true
      });
    }
  }
  for (const segment of job.audioSegments) {
    const duration = segment.end - segment.start;
    if (segment.sourceStart > 0) args.push("-ss", formatFfmpegNumber(segment.sourceStart));
    args.push("-t", formatFfmpegNumber(duration), "-i", segment.path);
    audioInputs.push({
      inputIndex: inputIndex++, start: segment.start, duration, volume: segment.volume,
      cleanupFilter: segment.cleanupFilter, fadeIn: 0, fadeOut: 0,
      speedAffected: segment.speedAffected ?? true
    });
  }

  const filters: string[] = [];
  let backgroundSources: string[] | null = null;
  if (backgroundPath) {
    filters.push(
      `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
      `crop=${width}:${height},setsar=1,fps=30,format=yuv420p[bgprepared]`
    );
    backgroundSources = pieces.map((_piece, index) => `bg${index}`);
    if (backgroundSources.length === 1) {
      filters.push(`[bgprepared]null[${backgroundSources[0]}]`);
    } else {
      filters.push(
        `[bgprepared]split=${backgroundSources.length}` +
        `${backgroundSources.map((label) => `[${label}]`).join("")}`
      );
    }
  }
  appendTransitionVideoFilters(filters, pieces, transitions, width, height, backgroundSources);
  const trimEnd = job.trimEnd && job.trimEnd > job.trimStart ? job.trimEnd : timelineEnd;
  const sourceDuration = Math.max(0.1, trimEnd - job.trimStart);
  const speedRegions = createSpeedRegions(job.speedEffects ?? [], job.trimStart, trimEnd);
  const zoomEffects = clipZoomEffects(job.zoomEffects ?? [], job.trimStart, trimEnd);
  const subtitleFilter = job.subtitlePath ? `,subtitles='${escapeFilterPath(job.subtitlePath)}'` : "";
  filters.push(`[vcat]trim=start=${formatFfmpegNumber(job.trimStart)}:end=${formatFfmpegNumber(trimEnd)},setpts=PTS-STARTPTS[vtrim]`);
  let videoLabel = "vtrim";
  if (zoomEffects.length > 0) {
    appendZoomVideoFilter(filters, videoLabel, "vzoom", zoomEffects, width, height);
    videoLabel = "vzoom";
  }
  if (speedRegions.some((region) => region.rate !== 1)) {
    appendSpeedVideoFilters(filters, videoLabel, "vspeed", speedRegions);
    videoLabel = "vspeed";
  }
  if (job.textOverlays?.length) {
    appendTextOverlayFilters(filters, videoLabel, "vtext", job.textOverlays, width, height);
    videoLabel = "vtext";
  }
  filters.push(`[${videoLabel}]null${subtitleFilter}[vout]`);

  const speedAudioLabels: string[] = [];
  const constantAudioLabels: string[] = [];
  audioInputs.forEach((input, index) => {
    const delay = Math.max(0, Math.round(input.start * 1000));
    const label = `a${index}`;
    const fadeIn = input.fadeIn > 0 ? `,afade=t=in:st=0:d=${formatFfmpegNumber(input.fadeIn)}` : "";
    const fadeOut = input.fadeOut > 0
      ? `,afade=t=out:st=${formatFfmpegNumber(Math.max(0, input.duration - input.fadeOut))}:d=${formatFfmpegNumber(input.fadeOut)}`
      : "";
    const cleanup = input.cleanupFilter ? `,${input.cleanupFilter}` : "";
    filters.push(`[${input.inputIndex}:a:0]atrim=duration=${formatFfmpegNumber(input.duration)},asetpts=PTS-STARTPTS${cleanup},volume=${formatFfmpegNumber(clampVolume(input.volume))}${fadeIn}${fadeOut},adelay=${delay}:all=1[${label}]`);
    (input.speedAffected ? speedAudioLabels : constantAudioLabels).push(`[${label}]`);
  });
  const trimAudioFilter = `atrim=start=${formatFfmpegNumber(job.trimStart)}:end=${formatFfmpegNumber(trimEnd)},asetpts=PTS-STARTPTS`;
  const hasSpeedAudio = speedAudioLabels.length > 0;
  const hasConstantAudio = constantAudioLabels.length > 0;
  if (hasSpeedAudio && hasConstantAudio) {
    filters.push(`${speedAudioLabels.join("")}amix=inputs=${speedAudioLabels.length}:duration=longest:dropout_transition=0:normalize=0[amix-speed]`);
    filters.push(`[amix-speed]${trimAudioFilter}[atrim]`);
    if (speedRegions.some((region) => region.rate !== 1)) {
      appendSpeedAudioFilters(filters, "atrim", "aout-speed", speedRegions);
    } else {
      filters.push("[atrim]anull[aout-speed]");
    }
    filters.push(`${constantAudioLabels.join("")}amix=inputs=${constantAudioLabels.length}:duration=longest:dropout_transition=0:normalize=0[amix-real]`);
    filters.push(`[amix-real]${trimAudioFilter}[aout-real]`);
    filters.push("[aout-speed][aout-real]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[aout]");
  } else if (hasSpeedAudio) {
    filters.push(`${speedAudioLabels.join("")}amix=inputs=${speedAudioLabels.length}:duration=longest:dropout_transition=0:normalize=0[amix]`);
    filters.push(`[amix]${trimAudioFilter}[atrim]`);
    if (speedRegions.some((region) => region.rate !== 1)) {
      appendSpeedAudioFilters(filters, "atrim", "aout", speedRegions);
    } else {
      filters.push("[atrim]anull[aout]");
    }
  } else if (hasConstantAudio) {
    filters.push(`${constantAudioLabels.join("")}amix=inputs=${constantAudioLabels.length}:duration=longest:dropout_transition=0:normalize=0[amix]`);
    filters.push(`[amix]${trimAudioFilter}[aout]`);
  }

  args.push("-filter_complex", filters.join(";"), "-map", "[vout]");
  if (hasSpeedAudio || hasConstantAudio) args.push("-map", "[aout]"); else args.push("-an");
  const speedAudioDuration = speedRegions.reduce(
    (total, region) => total + (region.end - region.start) / region.rate,
    0
  );
  const constantAudioDuration = audioInputs
    .filter((input) => !input.speedAffected)
    .reduce((maximum, input) => Math.max(maximum, input.start + input.duration - job.trimStart), 0);
  const outputDuration = Math.max(speedAudioDuration || sourceDuration, constantAudioDuration);
  args.push(...await createCodecArgs(job.format), "-t", formatFfmpegNumber(Math.max(0.1, outputDuration)), job.outputPath);
  await runProcess(resolveFfmpegPath(), args, {
    ...control,
    durationSeconds: outputDuration
  });
  return (await fs.stat(job.outputPath)).size;
}

type RelativeSpeedRegion = { start: number; end: number; rate: TimelineCompositionSpeedEffect["rate"] };
type RelativeZoomEffect = TimelineCompositionZoomEffect & { start: number; end: number };

/** Split a trimmed timeline into contiguous normal/speed regions. */
function createSpeedRegions(
  effects: TimelineCompositionSpeedEffect[],
  trimStart: number,
  trimEnd: number
): RelativeSpeedRegion[] {
  const duration = Math.max(0, trimEnd - trimStart);
  const clipped = effects
    .map((effect) => ({
      start: Math.max(0, effect.start - trimStart),
      end: Math.min(duration, effect.end - trimStart),
      rate: effect.rate
    }))
    .filter((effect) => effect.end - effect.start >= 0.01)
    .sort((a, b) => a.start - b.start);
  const regions: RelativeSpeedRegion[] = [];
  let cursor = 0;
  for (const effect of clipped) {
    if (effect.start > cursor + 0.001) regions.push({ start: cursor, end: effect.start, rate: 1 });
    regions.push({ start: Math.max(cursor, effect.start), end: effect.end, rate: effect.rate });
    cursor = Math.max(cursor, effect.end);
  }
  if (cursor < duration - 0.001) regions.push({ start: cursor, end: duration, rate: 1 });
  return regions.length > 0 ? regions : [{ start: 0, end: duration, rate: 1 }];
}

function clipZoomEffects(
  effects: TimelineCompositionZoomEffect[],
  trimStart: number,
  trimEnd: number
): RelativeZoomEffect[] {
  const duration = Math.max(0, trimEnd - trimStart);
  return effects.map((effect) => ({
    ...effect,
    start: Math.max(0, effect.start - trimStart),
    end: Math.min(duration, effect.end - trimStart)
  })).filter((effect) => effect.end - effect.start >= 0.01);
}

/** Dynamic scale + fixed crop reproduces the editor's focus-point zoom. */
function appendZoomVideoFilter(
  filters: string[],
  inputLabel: string,
  outputLabel: string,
  effects: RelativeZoomEffect[],
  width: number,
  height: number
): void {
  const strengthTerms = effects.map(createZoomStrengthExpression);
  const scale = `1${effects.map((effect, index) => `+(${strengthTerms[index]})*${formatFfmpegNumber(effect.scale - 1)}`).join("")}`;
  const originX = `50${effects.map((effect, index) => `+(${strengthTerms[index]})*${formatFfmpegNumber(effect.targetX - 50)}`).join("")}`;
  const originY = `50${effects.map((effect, index) => `+(${strengthTerms[index]})*${formatFfmpegNumber(effect.targetY - 50)}`).join("")}`;
  filters.push(
    `[${inputLabel}]scale=w='trunc(${width}*(${scale})/2)*2':h='trunc(${height}*(${scale})/2)*2':eval=frame,` +
    `crop=${width}:${height}:x='(in_w-out_w)*((${originX})/100)':y='(in_h-out_h)*((${originY})/100)'[${outputLabel}]`
  );
}

function createZoomStrengthExpression(effect: RelativeZoomEffect): string {
  const duration = effect.end - effect.start;
  const rampBySpeed = { slow: 1.6, medium: 1.1, fast: 0.45 } as const;
  const ramp = Math.max(0.01, Math.min(rampBySpeed[effect.speed], duration / 2));
  const raw = `min(1,min(max(0,(t-${formatFfmpegNumber(effect.start)})/${formatFfmpegNumber(ramp)}),max(0,(${formatFfmpegNumber(effect.end)}-t)/${formatFfmpegNumber(ramp)})))`;
  const eased = createZoomEasingExpression(raw, effect);
  return `if(between(t,${formatFfmpegNumber(effect.start)},${formatFfmpegNumber(effect.end)}),${eased},0)`;
}

function createZoomEasingExpression(progress: string, effect: RelativeZoomEffect): string {
  switch (effect.easing ?? "ease-in-out") {
    case "linear":
      return progress;
    case "ease-in":
      return `(${progress})*(${progress})`;
    case "ease-out":
      return `1-(1-(${progress}))*(1-(${progress}))`;
    case "custom": {
      const [, y1, , y2] = effect.bezier ?? [0.42, 0, 0.58, 1];
      return `3*(1-(${progress}))*(1-(${progress}))*(${progress})*${formatFfmpegNumber(y1)}+3*(1-(${progress}))*(${progress})*(${progress})*${formatFfmpegNumber(y2)}+(${progress})*(${progress})*(${progress})`;
    }
    case "ease-in-out":
      return `(${progress})*(${progress})*(3-2*(${progress}))`;
  }
}

function appendSpeedVideoFilters(
  filters: string[],
  inputLabel: string,
  outputLabel: string,
  regions: RelativeSpeedRegion[]
): void {
  const sources = regions.map((_region, index) => `vspeed${index}src`);
  filters.push(`[${inputLabel}]split=${regions.length}${sources.map((label) => `[${label}]`).join("")}`);
  const outputs = regions.map((region, index) => {
    const output = `vspeed${index}`;
    filters.push(
      `[${sources[index]}]trim=start=${formatFfmpegNumber(region.start)}:end=${formatFfmpegNumber(region.end)},` +
      `setpts=(PTS-STARTPTS)/${formatFfmpegNumber(region.rate)}[${output}]`
    );
    return `[${output}]`;
  });
  filters.push(`${outputs.join("")}concat=n=${outputs.length}:v=1:a=0[${outputLabel}]`);
}

function appendSpeedAudioFilters(
  filters: string[],
  inputLabel: string,
  outputLabel: string,
  regions: RelativeSpeedRegion[]
): void {
  const sources = regions.map((_region, index) => `aspeed${index}src`);
  filters.push(`[${inputLabel}]asplit=${regions.length}${sources.map((label) => `[${label}]`).join("")}`);
  const outputs = regions.map((region, index) => {
    const output = `aspeed${index}`;
    filters.push(
      `[${sources[index]}]atrim=start=${formatFfmpegNumber(region.start)}:end=${formatFfmpegNumber(region.end)},` +
      `asetpts=PTS-STARTPTS,atempo=${formatFfmpegNumber(region.rate)}[${output}]`
    );
    return `[${output}]`;
  });
  filters.push(`${outputs.join("")}concat=n=${outputs.length}:v=0:a=1[${outputLabel}]`);
}

/**
 * Build the `drawtext` filter for a single overlay, without stream labels so
 * that it works in both a labelled `-filter_complex` chain (the timeline
 * composition) and a plain `-vf` chain (the single-source export).
 */
export function createTextOverlayDrawtext(
  overlay: TimelineCompositionTextOverlay,
  height: number,
  width: number
): string {
  const start = formatFfmpegNumber(overlay.start);
  const end = formatFfmpegNumber(overlay.end);
  const ramp = formatFfmpegNumber(Math.min(0.4, Math.max(0.08, (overlay.end - overlay.start) / 2)));
  const entrance = `clip((t-${start})/${ramp},0,1)`;
  const hasExit = overlay.animation === "fade-in-out" || overlay.animation === "pop-in-out" || overlay.animation === "slide-in-out";
  const progress = hasExit ? `min(${entrance},clip((${end}-t)/${ramp},0,1))` : entrance;
  const baseFontSize = Math.max(12, Math.round(overlay.size * height / 1080));
  const pops = overlay.animation === "pop" || overlay.animation === "pop-in-out";
  const fontSize = pops
    ? `'${baseFontSize}*(0.72+0.28*${progress})'`
    : String(baseFontSize);
  const x = `${formatFfmpegNumber(overlay.x / 100)}*w-text_w/2`;
  const baseY = `${formatFfmpegNumber(overlay.y / 100)}*h-text_h/2`;
  const slides = overlay.animation === "slide-up" || overlay.animation === "slide-in-out";
  const y = slides
    ? `${baseY}+(1-${entrance})*${formatFfmpegNumber(height * 0.04)}`
    : baseY;
  const opacity = formatFfmpegNumber(Math.max(0, Math.min(100, overlay.opacity ?? 100)) / 100);
  const alpha = overlay.animation === "none" ? opacity : `'${opacity}*${progress}'`;
  // Mirrors the preview's `text-shadow: 0 2px 10px rgb(0 0 0 / 0.9)`. drawtext
  // has no blur, so the offset is scaled with the frame and the colour carries
  // the softness. Without it, light text on light footage is unreadable in the
  // export while looking fine in the editor.
  const shadowOffset = Math.max(1, Math.round(height * 2 / 1080));
  const font = resolveOverlayFont(overlay);
  const layout = layOutOverlayText(overlay, font.filePath, baseFontSize, width);
  const titleFilter = overlay.title
    ? `drawtext=text='${escapeDrawtextText(overlay.title)}':` +
      `${font.argument}:` +
      `fontcolor=0x${(overlay.box?.titleColor ?? overlay.color).slice(1)}:` +
      `fontsize=${Math.max(10, Math.round((overlay.box?.titleSize ?? overlay.size * 0.6) * height / 1080))}:` +
      `x='${x}':y='${baseY}-${Math.round(baseFontSize * 1.35)}':` +
      `alpha=${alpha}:shadowx=0:shadowy=${shadowOffset}:shadowcolor=black@0.8:` +
      `text_align=C:enable='between(t,${start},${end})',`
    : "";
  return titleFilter + (
    `drawtext=text='${escapeDrawtextText(layout.text)}':` +
    `${font.argument}:` +
    `fontcolor=0x${overlay.color.slice(1)}:fontsize=${fontSize}:x='${x}':y='${y}':` +
    `alpha=${alpha}:shadowx=0:shadowy=${shadowOffset}:shadowcolor=black@0.9:` +
    `text_align=C:line_spacing=${layout.lineSpacing}:` +
    `enable='between(t,${start},${end})'`
  );
}

/**
 * The preview wraps overlay text and centres the lines; drawtext does neither,
 * so the line breaks are computed here against the same font the filter draws
 * with.
 *
 * Without bundled metrics -- a non-sans family, or a missing font file -- the
 * text is passed through unwrapped, which is how it behaved before.
 */
function layOutOverlayText(
  overlay: TimelineCompositionTextOverlay,
  fontFilePath: string | null,
  fontSize: number,
  width: number
): { text: string; lineSpacing: number } {
  const metrics = fontFilePath ? loadFontMetrics(fontFilePath) : null;
  if (!metrics || width <= 0) {
    return { text: overlay.text, lineSpacing: 0 };
  }

  // `leading-tight` in the preview is a 1.25 line height. drawtext stacks lines
  // at the font's own baseline distance, so line_spacing carries the remainder.
  const naturalLineHeight = metrics.lineHeight / metrics.unitsPerEm;
  return {
    text: wrapTextToWidth(overlay.text, resolveOverlayWrapWidth(overlay.x, width), fontSize, metrics),
    lineSpacing: Math.round((1.25 - naturalLineHeight) * fontSize)
  };
}

/**
 * Width the preview wraps within, reproduced rather than idealised.
 *
 * The overlay is an absolutely positioned element with `left: x%`, no width and
 * `max-w-[90%]`, so CSS shrink-to-fit gives it whatever room is left between
 * `left` and the right edge, capped at 90%. The `translate(-50%)` that centres
 * it on the anchor runs after layout and does not widen the box. Text placed at
 * x=75% therefore wraps within a quarter of the frame, and only text at x=0
 * ever gets the full 90%.
 *
 * Using a flat 90% here would wrap the export differently from the editor,
 * which is the mismatch this is meant to remove.
 */
function resolveOverlayWrapWidth(x: number, width: number): number {
  const availableRatio = Math.max(0, 1 - Math.max(0, Math.min(100, x)) / 100);
  return width * Math.min(0.9, availableRatio);
}

function appendTextOverlayFilters(
  filters: string[],
  inputLabel: string,
  outputLabel: string,
  overlays: TimelineCompositionTextOverlay[],
  width: number,
  height: number
): void {
  let currentLabel = inputLabel;
  overlays.forEach((overlay, index) => {
    const nextLabel = index === overlays.length - 1 ? outputLabel : `vtext${index}`;
    currentLabel = appendCalloutBoxFilter(filters, currentLabel, overlay, height, width);
    const textFilter = createTextOverlayDrawtext(overlay, height, width);
    filters.push(`[${currentLabel}]${textFilter}[${nextLabel}]`);
    currentLabel = nextLabel;
  });
}

/**
 * Builds fixed-duration transition windows. Half of each window comes from the
 * outgoing clip and half from the incoming clip; cloned boundary frames fill
 * the opposite halves before FFmpeg's xfade combines them. Clip/timeline
 * duration therefore stays unchanged and subtitles remain synchronized.
 */
function appendTransitionVideoFilters(
  filters: string[],
  pieces: CompositionPiece[],
  transitions: TimelineCompositionTransition[],
  width: number,
  height: number,
  backgroundSources: string[] | null = null
): void {
  const transitionAfter = new Map<number, TimelineCompositionTransition>();
  for (let index = 0; index < pieces.length - 1; index += 1) {
    const transition = getTransitionBetween(pieces[index], pieces[index + 1], transitions);
    if (transition) transitionAfter.set(index, transition);
  }

  const labels = pieces.map((piece, index) => {
    const incoming = transitionAfter.get(index - 1);
    const outgoing = transitionAfter.get(index);
    const lead = (incoming?.duration ?? 0) / 2;
    const trail = (outgoing?.duration ?? 0) / 2;
    let base = `v${index}base`;
    const branchNames = ["body", ...(incoming ? ["head"] : []), ...(outgoing ? ["tail"] : [])];
    if (piece.gap && backgroundSources) {
      filters.push(`[${backgroundSources[index]}]null[v${index}gap]`);
      base = `v${index}gap`;
    } else {
      const padColor = backgroundSources ? "black@0" : "black";
      const pixelFormat = backgroundSources ? "yuva420p" : "yuv420p";
      filters.push(
        `[${piece.inputIndex}:v:0]setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:${padColor},setsar=1,fps=30,format=${pixelFormat}[${base}]`
      );
      if (backgroundSources) {
        const composited = `v${index}composited`;
        filters.push(`[${backgroundSources[index]}][${base}]overlay=0:0:format=auto,format=yuv420p[${composited}]`);
        base = composited;
      }
    }
    const sources = branchNames.map((name) => `v${index}${name}src`);
    if (sources.length === 1) filters.push(`[${base}]null[${sources[0]}]`);
    else filters.push(`[${base}]split=${sources.length}${sources.map((label) => `[${label}]`).join("")}`);

    const body = `v${index}body`;
    filters.push(
      `[${sources[0]}]trim=start=${formatFfmpegNumber(lead)}:` +
      `end=${formatFfmpegNumber(piece.duration - trail)},setpts=PTS-STARTPTS[${body}]`
    );
    let sourceIndex = 1;
    let head: string | null = null;
    let tail: string | null = null;
    if (incoming) {
      head = `v${index}head`;
      filters.push(
        `[${sources[sourceIndex++]}]trim=start=0:end=${formatFfmpegNumber(lead)},setpts=PTS-STARTPTS,` +
        `tpad=start_mode=clone:start_duration=${formatFfmpegNumber(lead)},` +
        `trim=duration=${formatFfmpegNumber(incoming.duration)},setpts=PTS-STARTPTS[${head}]`
      );
    }
    if (outgoing) {
      tail = `v${index}tail`;
      filters.push(
        `[${sources[sourceIndex]}]trim=start=${formatFfmpegNumber(piece.duration - trail)}:` +
        `end=${formatFfmpegNumber(piece.duration)},setpts=PTS-STARTPTS,` +
        `tpad=stop_mode=clone:stop_duration=${formatFfmpegNumber(trail)},` +
        `trim=duration=${formatFfmpegNumber(outgoing.duration)},setpts=PTS-STARTPTS[${tail}]`
      );
    }
    return { body, head, tail, base };
  });

  const outputUnits: string[] = [];
  for (let index = 0; index < pieces.length; index += 1) {
    outputUnits.push(`[${labels[index].body}]`);
    const transition = transitionAfter.get(index);
    if (!transition) continue;
    const tail = labels[index].tail;
    const head = labels[index + 1].head;
    if (!tail || !head) continue;
    const output = `vtransition${index}`;
    filters.push(
      `[${tail}][${head}]xfade=transition=${toFfmpegTransition(transition.type)}:` +
      `duration=${formatFfmpegNumber(transition.duration)}:offset=0[${output}]`
    );
    outputUnits.push(`[${output}]`);
  }
  filters.push(`${outputUnits.join("")}concat=n=${outputUnits.length}:v=1:a=0[vcat]`);
}

function getTransitionBetween(
  from: CompositionPiece | undefined,
  to: CompositionPiece | undefined,
  transitions: TimelineCompositionTransition[]
): TimelineCompositionTransition | null {
  if (!from?.segment?.id || !to?.segment?.id || from.gap || to.gap) return null;
  return transitions.find((item) =>
    item.fromSegmentId === from.segment?.id && item.toSegmentId === to.segment?.id
  ) ?? null;
}

function toFfmpegTransition(type: TimelineCompositionTransition["type"]): string {
  return ({ crossfade: "fade", "fade-black": "fadeblack", "slide-left": "slideleft", "wipe-left": "wipeleft" })[type];
}

export async function mediaHasAudio(filePath: string): Promise<boolean> {
  try {
    const stderr = await runProcessCapture(resolveFfmpegPath(), ["-i", filePath]);
    return /Stream #\S+: Audio:/i.test(stderr);
  } catch (error) {
    return /Stream #\S+: Audio:/i.test(error instanceof Error ? error.message : String(error));
  }
}

/** Read the duration FFmpeg reports after a recording container is remuxed. */
export async function probeMediaDurationMs(filePath: string): Promise<number | null> {
  let output = "";
  try {
    output = await runProcessCapture(resolveFfmpegPath(), ["-i", filePath]);
  } catch (error) {
    output = error instanceof Error ? error.message : String(error);
  }
  return parseFfmpegDurationMs(output);
}

/** Frame size of the first video stream, used to size and wrap text overlays. */
export async function probeMediaSize(
  filePath: string
): Promise<{ width: number; height: number } | null> {
  let output = "";
  try {
    output = await runProcessCapture(resolveFfmpegPath(), ["-i", filePath]);
  } catch (error) {
    output = error instanceof Error ? error.message : String(error);
  }
  return parseFfmpegSize(output);
}

export function parseFfmpegSize(
  output: string
): { width: number; height: number } | null {
  const match = /Stream #\S+: Video:.*?,\s*(\d+)x(\d+)/iu.exec(output);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

export function parseFfmpegDurationMs(output: string): number | null {
  const match = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/iu.exec(output);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const durationMs = ((hours * 60 + minutes) * 60 + seconds) * 1000;
  return Number.isFinite(durationMs) && durationMs >= 0 ? Math.round(durationMs) : null;
}

function addInput(args: string[], inputPath: string, trimStart: number): void {
  if (trimStart > 0) {
    args.push("-ss", formatFfmpegNumber(trimStart));
  }

  args.push("-i", inputPath);
}

export function createVideoFilter(
  resolution: ExportResolution,
  subtitlePath?: string | null,
  textOverlays?: TimelineCompositionTextOverlay[] | null,
  sourceSize?: { width: number; height: number } | null
): string {
  const dimensions = getResolutionDimensions(resolution);
  const filters: string[] = [];

  if (dimensions) {
    const [width, height] = dimensions;
    filters.push(
      `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`
    );
  }

  filters.push("setsar=1");
  // Overlays are sized and wrapped against the frame they are drawn on. With an
  // explicit export resolution that is the padded output; at "source"
  // resolution it is the probed input, falling back to 1080p so text stays
  // legible and wraps sanely when the probe fails.
  const overlayWidth = dimensions?.[0] ?? sourceSize?.width ?? 1920;
  const overlayHeight = dimensions?.[1] ?? sourceSize?.height ?? 1080;
  for (const overlay of textOverlays ?? []) {
    const boxFilter = createCalloutBoxDrawboxFilter(overlay, overlayHeight, overlayWidth);
    if (boxFilter) filters.push(boxFilter);
    filters.push(createTextOverlayDrawtext(overlay, overlayHeight, overlayWidth));
  }
  // Subtitles last so burned-in captions stay above overlay text, matching the
  // layering the timeline composition produces.
  if (subtitlePath) {
    filters.push(`subtitles='${escapeFilterPath(subtitlePath)}'`);
  }
  return filters.join(",");
}

function getResolutionDimensions(resolution: ExportResolution): [number, number] | null {
  switch (resolution) {
    case "720p":
      return [1280, 720];
    case "1080p":
      return [1920, 1080];
    case "1440p":
      return [2560, 1440];
    case "source":
      return null;
  }
}

async function createCodecArgs(format: ExportVideoFormat): Promise<string[]> {
  if (format === "webm") {
    return [
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      "0",
      "-crf",
      "30",
      "-c:a",
      "libopus",
      "-b:a",
      "128k"
    ];
  }

  const hardwareEncoder = await getWorkingH264Encoder();
  const videoArgs = hardwareEncoder
    ? ["-c:v", hardwareEncoder, "-b:v", "8M"]
    : ["-c:v", "libx264", "-preset", "medium", "-crf", "20"];
  return [
    ...videoArgs,
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart"
  ];
}

export function canStreamCopy(job: ExportVideoJob): boolean {
  const sourceExtension = path.extname(job.videoPath).toLowerCase();
  return (
    (job.format === "mp4" || job.format === "mov") &&
    (sourceExtension === ".mp4" || sourceExtension === ".mov") &&
    job.resolution === "source" &&
    job.trimStart === 0 &&
    job.trimEnd === null &&
    job.audioTracks.length === 0 &&
    job.preserveSourceAudio &&
    job.sourceAudioVolume === 1 &&
    !job.subtitlePath &&
    // Overlays are drawn by a filter, which a stream copy would skip entirely.
    !job.textOverlays?.length
  );
}

let workingH264Encoder: Promise<string | null> | null = null;

async function getWorkingH264Encoder(): Promise<string | null> {
  workingH264Encoder ??= probeWorkingH264Encoder();
  return workingH264Encoder;
}

async function probeWorkingH264Encoder(): Promise<string | null> {
  const candidates = process.platform === "darwin"
    ? ["h264_videotoolbox"]
    : process.platform === "win32"
      ? ["h264_nvenc", "h264_qsv", "h264_amf"]
      : [];
  for (const encoder of candidates) {
    try {
      await runProcess(resolveFfmpegPath(), [
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=64x64:d=0.05",
        "-frames:v",
        "1",
        "-c:v",
        encoder,
        "-f",
        "null",
        "-"
      ]);
      return encoder;
    } catch {
      // Try the next hardware backend, then fall back to libx264.
    }
  }
  return null;
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) {
    return 1;
  }

  // Allow up to a ~+12 dB boost to match the editor's master gain range.
  return Math.min(4, Math.max(0, volume));
}

function formatFfmpegNumber(value: number): string {
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function escapeFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function escapeDrawtextText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    // A real newline is what drawtext breaks a line on. The filter-argument
    // parser treats a backslash as escaping the next character, so the "\n"
    // this used to emit arrived at drawtext as a bare "n" and printed as one.
    .replace(/\r\n/g, "\n");
}

// In-flight FFmpeg children, so the app can kill them on quit instead of
// letting an export/remux outlive the app (burning CPU, writing a half file).
const activeProcesses = new Set<ReturnType<typeof spawn>>();

// FFmpeg streams continuous progress/stats lines to stderr; keep only the tail
// so a long or corrupt job cannot grow an unbounded string in memory.
const maxStderrChars = 16_384;

type RunProcessOptions = ExportProcessControl & { durationSeconds?: number };

function runProcess(
  command: string,
  args: string[],
  options: RunProcessOptions = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new Error("Export cancelled."));
      return;
    }
    const progressArgs = options.onProgress && options.durationSeconds
      ? ["-progress", "pipe:1", "-nostats"]
      : [];
    // -hide_banner + -loglevel error keep stderr to genuine failures instead of
    // the per-frame stats spam that otherwise floods the captured buffer.
    const child = spawn(command, ["-hide_banner", "-loglevel", "error", ...progressArgs, ...args], {
      windowsHide: true
    });
    activeProcesses.add(child);

    let stderr = "";
    let stdoutRemainder = "";
    let settled = false;
    let terminationError: Error | null = null;
    let lastPercent = 0;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      activeProcesses.delete(child);
      options.signal?.removeEventListener("abort", abort);
      if (timeout) clearTimeout(timeout);
      if (error) reject(error); else resolve();
    };
    const abort = () => {
      terminationError = new Error("Export cancelled.");
      child.kill("SIGKILL");
    };
    const timeoutMs = options.durationSeconds
      ? calculateExportTimeoutMs(options.durationSeconds)
      : null;
    const timeout = timeoutMs
      ? setTimeout(() => {
          terminationError = new Error("Export timed out before FFmpeg completed.");
          child.kill("SIGKILL");
        }, timeoutMs)
      : null;

    options.signal?.addEventListener("abort", abort, { once: true });

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutRemainder += chunk.toString();
      const lines = stdoutRemainder.split(/\r?\n/u);
      stdoutRemainder = lines.pop() ?? "";
      for (const line of lines) {
        const separator = line.indexOf("=");
        if (separator < 1 || !options.durationSeconds) continue;
        const key = line.slice(0, separator);
        const value = line.slice(separator + 1);
        if (key === "progress" && value === "end") {
          lastPercent = 100;
          options.onProgress?.(100, "Finalizing export…");
          continue;
        }
        const elapsed = parseFfmpegProgressSeconds(key, value);
        if (elapsed === null) continue;
        const percent = calculateExportPercent(elapsed, options.durationSeconds);
        if (percent >= lastPercent + 0.25) {
          lastPercent = percent;
          options.onProgress?.(percent, "Exporting video…");
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-maxStderrChars);
    });

    child.on("error", (error: Error & { code?: string }) => {
      const reason = error.code ? `${error.code}: ${error.message}` : error.message;
      finish(new Error(`Failed to start FFmpeg at "${command}". ${reason}`));
    });
    child.on("close", (code) => {
      // Wait for close before callers remove the partial output, especially
      // on Windows where the child may still hold the output file open.
      if (terminationError) { finish(terminationError); return; }
      if (code === 0) {
        if (lastPercent < 100) options.onProgress?.(100, "Finalizing export…");
        finish();
        return;
      }

      finish(new Error(`FFmpeg exited with code ${code ?? "unknown"}: ${stderr}`));
    });
  });
}

function runProcessCapture(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, ["-hide_banner", "-nostdin", ...args], { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-maxStderrChars); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stderr) : reject(new Error(stderr)));
  });
}

// Called on app quit: SIGKILL any in-flight FFmpeg child so it cannot outlive
// the app and keep encoding into a partial output file.
export function killActiveFfmpegProcesses(): void {
  for (const child of activeProcesses) {
    child.kill("SIGKILL");
  }
  activeProcesses.clear();
}
