/** Deterministic scheduling, packet indexing and mux decisions for G2-RENDER. */
import { RenderError, type Ticks } from "./types";
import { frameStartTicks, ticksPerFrame } from "./scene";

export interface ProbePacket {
  readonly ptsTicks: Ticks;
  readonly dtsTicks: Ticks;
  readonly isKeyframe: boolean;
  readonly byteOffset: number;
  readonly byteSize: number;
  readonly frameIndex: number;
}

export interface ScheduleResult {
  readonly frameIndex: number;
  readonly tTicks: Ticks;
  readonly sourceFrameIndex: number;
}

export type DemuxCandidate = "D1-indexed" | "D2-js-container" | "D3-ffmpeg-raw";
export type MuxCandidate = "M1-ffmpeg-elementary" | "M2-js-intermediate" | "M3-avassetwriter";

/**
 * CFR output frame `n` maps to `t_n = n · ticksPerFrame`; a VFR source holds
 * the latest packet with PTS <= t. Cold seeks use the nearest preceding
 * keyframe and discard frames before the target (R1/R3).
 */
export function scheduleFrame(packets: readonly ProbePacket[], outputFrame: number, ticksPerOutputFrame: Ticks): ScheduleResult {
  const tTicks = BigInt(outputFrame) * ticksPerOutputFrame;
  let selected: ProbePacket | undefined;
  for (const packet of packets) {
    if (packet.ptsTicks > tTicks) break;
    selected = packet;
  }
  if (selected === undefined) throw new RenderError("NO_SOURCE_FRAME", `frame ${outputFrame}`);
  return { frameIndex: outputFrame, tTicks, sourceFrameIndex: selected.frameIndex };
}

export function seekToFrame(packets: readonly ProbePacket[], targetFrame: number): readonly ProbePacket[] {
  const target = packets.find((packet) => packet.frameIndex === targetFrame);
  if (target === undefined) throw new RenderError("SEEK_OUT_OF_RANGE", `frame ${targetFrame}`);
  let keyframe: ProbePacket | undefined;
  for (const packet of packets) {
    if (packet.frameIndex > targetFrame) break;
    if (packet.isKeyframe) keyframe = packet;
  }
  if (keyframe === undefined) throw new RenderError("NO_KEYFRAME", `frame ${targetFrame}`);
  const decode: ProbePacket[] = [];
  for (const packet of packets) {
    if (packet.frameIndex < keyframe.frameIndex || packet.frameIndex > targetFrame) continue;
    decode.push(packet);
  }
  return decode;
}

export function stepFrame(packets: readonly ProbePacket[], currentFrame: number, direction: -1 | 1): number {
  const next = currentFrame + direction;
  const candidate = packets.find((packet) => packet.frameIndex === next);
  if (candidate === undefined) throw new RenderError("STEP_OUT_OF_RANGE", `${currentFrame}${direction > 0 ? "+1" : "-1"}`);
  return next;
}

/** Exact monotonic frame index sequence for deterministic frame stepping. */
export function stepSequence(packets: readonly ProbePacket[], startFrame: number, steps: number): readonly number[] {
  const result: number[] = [startFrame];
  let current = startFrame;
  for (let index = 0; index < steps; index += 1) {
    current = stepFrame(packets, current, 1);
    result.push(current);
  }
  return result;
}

export function chooseDemuxCandidate(hasAccuratePacketIndex: boolean, containerSupported: boolean): DemuxCandidate {
  if (hasAccuratePacketIndex) return "D1-indexed";
  if (containerSupported) return "D2-js-container";
  return "D3-ffmpeg-raw";
}

export function chooseMuxCandidate(elementaryStreamMuxed: boolean, jsIntermediateMuxed: boolean): MuxCandidate {
  if (elementaryStreamMuxed) return "M1-ffmpeg-elementary";
  if (jsIntermediateMuxed) return "M2-js-intermediate";
  return "M3-avassetwriter";
}

export interface FrameBudget {
  readonly decodeQueueSize: number;
  readonly encodeQueueSize: number;
  readonly framesAlivePerSource: number;
  readonly framesAliveTotal: number;
  readonly framesClosedWithinTicks: number;
}

export const FRAME_BUDGET: FrameBudget = {
  decodeQueueSize: 8,
  encodeQueueSize: 4,
  framesAlivePerSource: 6,
  framesAliveTotal: 24,
  framesClosedWithinTicks: 2
};

export function enforceFrameBudget(budget: FrameBudget): void {
  if (budget.decodeQueueSize > FRAME_BUDGET.decodeQueueSize
    || budget.encodeQueueSize > FRAME_BUDGET.encodeQueueSize
    || budget.framesAlivePerSource > FRAME_BUDGET.framesAlivePerSource
    || budget.framesAliveTotal > FRAME_BUDGET.framesAliveTotal
    || budget.framesClosedWithinTicks > FRAME_BUDGET.framesClosedWithinTicks) {
    throw new RenderError("FRAME_BUDGET_EXCEEDED", JSON.stringify(budget));
  }
}

export interface RenderCheck {
  readonly id: string;
  readonly status: "PASS" | "PARTIAL" | "BLOCKED_EXTERNAL" | "INFO";
  readonly detail: string;
}

export interface RendererReport {
  readonly verdict: "GO" | "PARTIAL" | "NO-GO";
  readonly checks: readonly RenderCheck[];
}

const EXTERNAL_CHECKS: readonly RenderCheck[] = [
  { id: "R6", status: "BLOCKED_EXTERNAL", detail: "OS-level VideoToolbox proof and powermetrics require target hardware and sudo" },
  { id: "R7", status: "BLOCKED_EXTERNAL", detail: "three >=5 min runs on pinned Electron target hardware not performed" },
  { id: "R9", status: "BLOCKED_EXTERNAL", detail: "5 min WebCodecs preview measurement not performed" },
  { id: "R13", status: "BLOCKED_EXTERNAL", detail: ">=10 min finalized file flash/beep measurement not performed" },
  { id: "R14", status: "BLOCKED_EXTERNAL", detail: "QuickTime/AVFoundation manual open-and-play must be done by the owner" },
  { id: "R15", status: "BLOCKED_EXTERNAL", detail: "full R1-R12 suite on pinned Electron target runtime not performed" },
  { id: "R11", status: "INFO", detail: "4K60 export is informational only" }
];

/** A local functional probe can never claim GO with the listed external gaps. */
export function buildRendererReport(localChecks: readonly RenderCheck[]): RendererReport {
  return { verdict: "PARTIAL", checks: [...localChecks, ...EXTERNAL_CHECKS] };
}

export function packetsFromTimes(times: readonly bigint[], fps: number): readonly ProbePacket[] {
  if (!Number.isInteger(fps) || fps <= 0) throw new RenderError("UNSUPPORTED_FPS", String(fps));
  const fpsBigInt = BigInt(fps);
  if ((705_600_000n % fpsBigInt) !== 0n) throw new RenderError("UNSUPPORTED_FPS", String(fps));
  return times.map((time, index) => ({
    ptsTicks: time,
    dtsTicks: time,
    isKeyframe: index % 30 === 0,
    byteOffset: index * 1024,
    byteSize: 1024,
    frameIndex: index
  }));
}

export { frameStartTicks, ticksPerFrame };
