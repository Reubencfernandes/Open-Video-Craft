import type { ZoomEffect, ZoomSpeed } from "./types";
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
      const progress = smootherStep((time - effect.end) / gapDuration);
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
    return interpolateZoomTransform(entryTransform, fullZoom, smootherStep(elapsed / ramp));
  }

  if (!nextIsChained && elapsed > duration - ramp) {
    return interpolateZoomTransform(
      fullZoom,
      { scale: 1, originX: 50, originY: 50 },
      smootherStep((elapsed - (duration - ramp)) / ramp)
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

function getZoomRampDuration(effect: ZoomEffect, duration: number): number {
  return Math.min(zoomRampBySpeed[effect.speed] ?? zoomRampBySpeed.medium, duration / 2);
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

function smootherStep(value: number): number {
  const t = clampNumber(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
