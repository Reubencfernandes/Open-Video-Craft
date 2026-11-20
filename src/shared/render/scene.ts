/**
 * One deterministic scene evaluator shared by preview and export.
 * It has no Electron, DOM, WebGL or WebCodecs dependency so its output can be
 * golden-tested on any runner (ARCHITECTURE.md §4.3, stage 4).
 */
import {
  RenderError,
  type Crossfade,
  type RenderDocument,
  type RenderScene,
  type RenderSceneLayer,
  type Ticks,
  type Transform
} from "./types";

export const TICKS_PER_SECOND = 705_600_000n;

export function ticksPerFrame(document: RenderDocument): Ticks {
  const value = (TICKS_PER_SECOND * BigInt(document.fpsDenominator)) / BigInt(document.fpsNumerator);
  if (value <= 0n || (TICKS_PER_SECOND * BigInt(document.fpsDenominator)) % BigInt(document.fpsNumerator) !== 0n) {
    throw new RenderError("UNSUPPORTED_FPS", `${document.fpsNumerator}/${document.fpsDenominator}`);
  }
  return value;
}

export function frameStartTicks(document: RenderDocument, frameIndex: number): Ticks {
  if (!Number.isInteger(frameIndex) || frameIndex < 0) {
    throw new RenderError("INVALID_FRAME", `frame ${frameIndex}`);
  }
  return BigInt(frameIndex) * ticksPerFrame(document);
}

function interpolateScale(keys: readonly { readonly atTicks: Ticks; readonly value: number }[], at: Ticks): number {
  if (keys.length === 0) return 1;
  let previous = keys[0];
  for (const key of keys) {
    if (key.atTicks > at) break;
    previous = key;
  }
  if (at <= previous.atTicks) return previous.value;
  const next = keys.find((key) => key.atTicks > at);
  if (next === undefined) return previous.value;
  const span = next.atTicks - previous.atTicks;
  if (span <= 0n) return previous.value;
  const ratio = Number(at - previous.atTicks) / Number(span);
  return previous.value + (next.value - previous.value) * ratio;
}

function crossfadeOpacity(fades: readonly Crossfade[], layerId: string, tTicks: Ticks): number | undefined {
  let opacity: number | undefined;
  for (const fade of fades) {
    if (fade.layerId !== layerId) continue;
    if (tTicks < fade.startTicks || tTicks > fade.startTicks + fade.durationTicks) continue;
    const fraction = Number(tTicks - fade.startTicks) / Number(fade.durationTicks);
    opacity = opacity === undefined ? fraction : Math.min(opacity, fraction);
  }
  return opacity;
}

function scaleTransform(transform: Transform, scale: number): Transform {
  const centerX = transform.x + transform.width / 2;
  const centerY = transform.y + transform.height / 2;
  return {
    ...transform,
    x: centerX - (transform.width * scale) / 2,
    y: centerY - (transform.height * scale) / 2,
    width: transform.width * scale,
    height: transform.height * scale
  };
}

/** `evaluateScene(doc, tTicks) -> RenderScene`, one implementation for both paths. */
export function evaluateScene(document: RenderDocument, tTicks: Ticks): RenderScene {
  if (document.hdrPresent) {
    throw new RenderError("HDR_REFUSED", "HDR inputs are refused in SDR BT.709/sRGB PoC");
  }
  if (document.width <= 0 || document.height <= 0) {
    throw new RenderError("INVALID_CANVAS", `${document.width}x${document.height}`);
  }
  if (tTicks < 0n) throw new RenderError("INVALID_TIME", String(tTicks));

  const fades = document.crossfades ?? [];
  const zoom = document.zoom === undefined ? 1 : interpolateScale(document.zoom.scale, tTicks);

  const layers: RenderSceneLayer[] = document.layers.map((layer) => {
    const fadeOpacity = crossfadeOpacity(fades, layer.id, tTicks) ?? 1;
    if (layer.kind === "media") {
      return {
        id: layer.id,
        kind: layer.kind,
        sourceId: layer.sourceId,
        sourceTicks: layer.sourceStartTicks + tTicks,
        transform: scaleTransform(layer.transform, zoom),
        opacity: layer.transform.opacity * fadeOpacity,
        mask: layer.mask,
        ...(layer.border === undefined ? {} : { border: layer.border })
      };
    }
    if (layer.kind === "text") {
      return {
        id: layer.id,
        kind: layer.kind,
        transform: scaleTransform(layer.transform, zoom),
        opacity: layer.transform.opacity * fadeOpacity,
        mask: { kind: "none" as const, featherPx: 0 },
        text: layer.text,
        color: layer.color,
        fontPx: layer.fontPx,
        progress: layer.progress
      };
    }
    return {
      id: layer.id,
      kind: layer.kind,
      transform: { x: 0, y: 0, width: document.width, height: document.height, opacity: 1, rotationRadians: 0 },
      opacity: 1,
      mask: { kind: "none" as const, featherPx: 0 },
      color: layer.color
    };
  });

  return {
    documentId: document.id,
    frameIndex: Number(tTicks / ticksPerFrame(document)),
    tTicks,
    width: document.width,
    height: document.height,
    layers,
    colorSpace: "srgb-bt709-sdr"
  };
}
