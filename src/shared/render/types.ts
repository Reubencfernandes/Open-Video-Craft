/**
 * Pure render-domain types for the G2-RENDER PoC.
 * All timeline values are Ticks in the 705,600,000 Hz timebase.
 */
export type Ticks = bigint;

export interface Transform {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly opacity: number;
  readonly rotationRadians: number;
}

export interface Mask {
  readonly kind: "none" | "circle";
  readonly featherPx: number;
}

export interface Border {
  readonly widthPx: number;
  readonly color: string;
  readonly shadowBlurPx: number;
}

export interface MediaLayer {
  readonly kind: "media";
  readonly id: string;
  readonly sourceId: string;
  readonly sourceStartTicks: Ticks;
  readonly transform: Transform;
  readonly mask: Mask;
  readonly border?: Border;
}

export interface BackgroundLayer {
  readonly kind: "background";
  readonly id: string;
  readonly color: string;
}

export interface TextLayer {
  readonly kind: "text";
  readonly id: string;
  readonly text: string;
  readonly fontPx: number;
  readonly color: string;
  readonly transform: Transform;
  /** Karaoke: fraction of the text highlighted at this frame. */
  readonly progress: number;
}

export type RenderLayer = MediaLayer | BackgroundLayer | TextLayer;

export interface Keyframe<T> {
  readonly atTicks: Ticks;
  readonly value: T;
}

export interface ZoomAnimation {
  readonly scale: readonly Keyframe<number>[];
}

export interface Crossfade {
  readonly layerId: string;
  readonly startTicks: Ticks;
  readonly durationTicks: Ticks;
}

export interface RenderDocument {
  readonly id: string;
  readonly fpsNumerator: number;
  readonly fpsDenominator: number;
  readonly width: number;
  readonly height: number;
  readonly layers: readonly RenderLayer[];
  readonly zoom?: ZoomAnimation;
  readonly crossfades?: readonly Crossfade[];
  readonly hdrPresent: boolean;
}

export interface RenderSceneLayer {
  readonly id: string;
  readonly kind: RenderLayer["kind"];
  readonly sourceId?: string;
  readonly sourceTicks?: Ticks;
  readonly transform: Transform;
  readonly opacity: number;
  readonly mask: Mask;
  readonly border?: Border;
  readonly text?: string;
  readonly color?: string;
  readonly fontPx?: number;
  readonly progress?: number;
}

export interface RenderScene {
  readonly documentId: string;
  readonly frameIndex: number;
  readonly tTicks: Ticks;
  readonly width: number;
  readonly height: number;
  readonly layers: readonly RenderSceneLayer[];
  readonly colorSpace: "srgb-bt709-sdr";
}

export class RenderError extends Error {
  readonly code: string;

  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "RenderError";
    this.code = code;
  }
}
