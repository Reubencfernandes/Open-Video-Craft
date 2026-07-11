/**
 * Zoom effect math: active-zoom lookup and the preview transform it drives.
 */
import type { ZoomEasing, ZoomEffect, ZoomSpeed } from "./types";
import { clampNumber } from "./utils";

const zoomChainGapSeconds = 0.45;
const zoomDirectChainGapSeconds = 0.05;
const zoomRampBySpeed: Record<ZoomSpeed, number> = { slow: 1.6, medium: 1.1, fast: 0.45 };

type ZoomTransform = {
  scale: number;
  originX: number;
  originY: number;
};

export function getActiveZoom(effects: ZoomEffect[], time: number): ZoomTransform {
  const orderedEffects = getOrderedZoomEffects(effects);
  let activeIndex = -1;
  for (let index = 0; index < orderedEffects.length; index += 1) {
    const effect = orderedEffects[index];
    if (time >= effect.start && time <= effect.end) {
      activeIndex = index;
    }
  }

  if (activeIndex === -1) {
    const bridgeIndex = orderedEffects.findIndex((effect, index) => {
      const nextEffect = orderedEffects[index + 1];
      return (
        Boolean(nextEffect) &&
        time > effect.end &&
        time < nextEffect.start &&
        areZoomEffectsChained(effect, nextEffect)
      );
    });

    if (bridgeIndex >= 0) {
      const effect = orderedEffects[bridgeIndex];
      const nextEffect = orderedEffects[bridgeIndex + 1];
      const gapDuration = Math.max(0.001, nextEffect.start - effect.end);
      const progress = applyZoomEasing((time - effect.end) / gapDuration, nextEffect);
      return interpolateZoomTransform(
        getZoomFullTransform(effect),
        getZoomFullTransform(nextEffect),
        progress
      );
    }

    return { scale: 1, originX: 50, originY: 50 };
  }

  const effect = orderedEffects[activeIndex];
  const previousEffect = orderedEffects[activeIndex - 1] ?? null;
  const nextEffect = orderedEffects[activeIndex + 1] ?? null;
  const previousGap = previousEffect ? effect.start - previousEffect.end : Number.POSITIVE_INFINITY;
  const previousIsChained = Boolean(
    previousEffect && previousGap <= zoomChainGapSeconds
  );
  const nextIsChained = Boolean(nextEffect && areZoomEffectsChained(effect, nextEffect));
  const fullZoom = getZoomFullTransform(effect);
  const duration = Math.max(0.1, effect.end - effect.start);
  const elapsed = clampNumber(time - effect.start, 0, duration);
  const ramp = getZoomRampDuration(effect, duration);

  if (elapsed < ramp) {
    const entryTransform =
      previousIsChained && previousGap <= zoomDirectChainGapSeconds && previousEffect
        ? getZoomFullTransform(previousEffect)
        : previousIsChained
          ? fullZoom
          : { scale: 1, originX: 50, originY: 50 };
    return interpolateZoomTransform(entryTransform, fullZoom, applyZoomEasing(elapsed / ramp, effect));
  }

  if (!nextIsChained && elapsed > duration - ramp) {
    return interpolateZoomTransform(
      fullZoom,
      { scale: 1, originX: 50, originY: 50 },
      applyZoomEasing((elapsed - (duration - ramp)) / ramp, effect)
    );
  }

  return fullZoom;
}

export function isZoomActiveAtTime(effects: ZoomEffect[], time: number): boolean {
  const orderedEffects = getOrderedZoomEffects(effects);
  return orderedEffects.some((effect, index) => {
    if (time >= effect.start && time <= effect.end) {
      return true;
    }

    const nextEffect = orderedEffects[index + 1];
    return (
      Boolean(nextEffect) &&
      time > effect.end &&
      time < nextEffect.start &&
      areZoomEffectsChained(effect, nextEffect)
    );
  });
}

function getOrderedZoomEffects(effects: ZoomEffect[]): ZoomEffect[] {
  return [...effects].sort((a, b) => a.start - b.start || a.end - b.end);
}

function areZoomEffectsChained(effect: ZoomEffect, nextEffect: ZoomEffect): boolean {
  return nextEffect.start - effect.end <= zoomChainGapSeconds;
}

export function getZoomRampDuration(effect: ZoomEffect, duration: number): number {
  return Math.min(zoomRampBySpeed[effect.speed] ?? zoomRampBySpeed.medium, duration / 2);
}

export function getZoomPreviewTime(effect: ZoomEffect, progress: number): number {
  const duration = Math.max(0.1, effect.end - effect.start);
  return effect.start + getZoomRampDuration(effect, duration) * clampNumber(progress, 0, 1);
}

function getZoomFullTransform(effect: ZoomEffect): ZoomTransform {
  return {
    scale: effect.scale,
    originX: effect.targetX,
    originY: effect.targetY
  };
}

function interpolateZoomTransform(
  from: ZoomTransform,
  to: ZoomTransform,
  progress: number
): ZoomTransform {
  const t = clampNumber(progress, 0, 1);
  return {
    scale: from.scale + (to.scale - from.scale) * t,
    originX: from.originX + (to.originX - from.originX) * t,
    originY: from.originY + (to.originY - from.originY) * t
  };
}

const easingBezier: Record<Exclude<ZoomEasing, "custom">, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1]
};

export function applyZoomEasing(value: number, effect: Pick<ZoomEffect, "easing" | "bezier">): number {
  const progress = clampNumber(value, 0, 1);
  const easing = effect.easing ?? "ease-in-out";
  const bezier = easing === "custom" ? effect.bezier ?? easingBezier["ease-in-out"] : easingBezier[easing];
  return cubicBezierAtTime(progress, bezier);
}

function cubicBezierAtTime(time: number, curve: [number, number, number, number]): number {
  if (time <= 0) {
    return 0;
  }
  if (time >= 1) {
    return 1;
  }

  const [x1, y1, x2, y2] = curve.map((point) => clampNumber(point, 0, 1)) as [number, number, number, number];
  let low = 0;
  let high = 1;
  let parameter = time;

  for (let iteration = 0; iteration < 14; iteration += 1) {
    parameter = (low + high) / 2;
    const x = cubicBezierCoordinate(parameter, x1, x2);
    if (x < time) {
      low = parameter;
    } else {
      high = parameter;
    }
  }

  return cubicBezierCoordinate(parameter, y1, y2);
}

function cubicBezierCoordinate(parameter: number, first: number, second: number): number {
  const inverse = 1 - parameter;
  return 3 * inverse * inverse * parameter * first + 3 * inverse * parameter * parameter * second + parameter * parameter * parameter;
}
