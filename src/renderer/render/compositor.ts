/**
 * WebGL2 compositor and WebCodecs encode primitives for the G2-RENDER PoC.
 * This module has no Electron import: the hidden renderer injects the canvas
 * and encoder, so the frame accounting can be exercised in isolation.
 */
import { FRAME_BUDGET, enforceFrameBudget } from "../../shared/render/pipeline";
import type { RenderScene } from "../../shared/render/types";

export interface FrameCounter {
  created: number;
  closed: number;
  alive: number;
}

export class FrameTracker {
  private readonly aliveBySource = new Map<string, number>();
  private readonly state: FrameCounter = { created: 0, closed: 0, alive: 0 };

  get snapshot(): FrameCounter {
    return { ...this.state };
  }

  created(sourceId: string): void {
    this.state.created += 1;
    this.state.alive += 1;
    this.aliveBySource.set(sourceId, (this.aliveBySource.get(sourceId) ?? 0) + 1);
    this.check();
  }

  closed(sourceId: string): void {
    this.state.closed += 1;
    this.state.alive -= 1;
    this.aliveBySource.set(sourceId, Math.max(0, (this.aliveBySource.get(sourceId) ?? 0) - 1));
    this.check();
  }

  private check(): void {
    enforceFrameBudget({
      decodeQueueSize: 0,
      encodeQueueSize: 0,
      framesAlivePerSource: Math.max(0, ...this.aliveBySource.values()),
      framesAliveTotal: this.state.alive,
      framesClosedWithinTicks: FRAME_BUDGET.framesClosedWithinTicks
    });
  }
}

export interface WebGL2Surface {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
}

export function createSurface(canvas: HTMLCanvasElement): WebGL2Surface {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance"
  });
  if (gl === null) throw new Error("WEBGL2_UNAVAILABLE");
  return { canvas, gl };
}

/** Draws one evaluated scene. One quad per layer, no per-frame allocation of shaders. */
export function drawScene(surface: WebGL2Surface, scene: RenderScene): void {
  const { gl, canvas } = surface;
  if (canvas.width !== scene.width || canvas.height !== scene.height) {
    canvas.width = scene.width;
    canvas.height = scene.height;
  }
  gl.viewport(0, 0, scene.width, scene.height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  for (const layer of scene.layers) {
    const left = Math.max(0, Math.round(layer.transform.x));
    const bottom = Math.max(0, Math.round(scene.height - layer.transform.y - layer.transform.height));
    const rectWidth = Math.max(1, Math.round(layer.transform.width));
    const rectHeight = Math.max(1, Math.round(layer.transform.height));
    const fill = layer.kind === "background" ? 0.08 : layer.kind === "text" ? 0.9 : 0.5;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(left, bottom, rectWidth, rectHeight);
    gl.clearColor(fill * layer.opacity, fill * layer.opacity, fill * layer.opacity, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.SCISSOR_TEST);
  }
}

export interface EncoderProbe {
  readonly decodeHardware: boolean;
  readonly encodeHardware: boolean;
  readonly decodeSoftware: boolean;
  readonly encodeSoftware: boolean;
}

/** Support probing is a signal only; R6 requires OS-level proof as well. */
export async function probeWebCodecsSupport(
  decoderConfig: VideoDecoderConfig,
  encoderConfig: VideoEncoderConfig
): Promise<EncoderProbe> {
  const preferHardware = { hardwareAcceleration: "prefer-hardware" as const };
  const preferSoftware = { hardwareAcceleration: "prefer-software" as const };
  const [decodeHardware, encodeHardware, decodeSoftware, encodeSoftware] = await Promise.all([
    VideoDecoder.isConfigSupported({ ...decoderConfig, ...preferHardware }),
    VideoEncoder.isConfigSupported({ ...encoderConfig, ...preferHardware }),
    VideoDecoder.isConfigSupported({ ...decoderConfig, ...preferSoftware }),
    VideoEncoder.isConfigSupported({ ...encoderConfig, ...preferSoftware })
  ]);
  return {
    decodeHardware: decodeHardware.supported === true,
    encodeHardware: encodeHardware.supported === true,
    decodeSoftware: decodeSoftware.supported === true,
    encodeSoftware: encodeSoftware.supported === true
  };
}

export interface BackpressureState {
  readonly decodeQueueSize: number;
  readonly encodeQueueSize: number;
}

/** Encoder back-pressure pauses decode; both queues stay inside R5 budgets. */
export function shouldPauseDecode(state: BackpressureState): boolean {
  enforceFrameBudget({
    decodeQueueSize: state.decodeQueueSize,
    encodeQueueSize: state.encodeQueueSize,
    framesAlivePerSource: 0,
    framesAliveTotal: 0,
    framesClosedWithinTicks: FRAME_BUDGET.framesClosedWithinTicks
  });
  return state.decodeQueueSize >= FRAME_BUDGET.decodeQueueSize
    || state.encodeQueueSize >= FRAME_BUDGET.encodeQueueSize;
}
