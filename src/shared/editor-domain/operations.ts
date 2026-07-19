import { finite, isSubtitleSegment, isTextOverlay, validateEditorStateSnapshot } from "./schema";
import { getAudioLaneLevelKey } from "./audio-levels";
import type {
  EditorEditOperation,
  EditorEditResult,
  EditorStateSnapshot,
  ClipTransition,
  SpeedEffect,
  SubtitleSegment,
  SubtitleWord,
  TimelineSegment,
  TrimRange,
  ZoomEffect
} from "./types";

/** Returns the furthest occupied timeline point, independent of export range. */
export function getEditorDuration(state: EditorStateSnapshot): number {
  return state.timelineSegments.reduce((max, segment) => Math.max(max, segment.end), 0);
}

/**
 * Applies a complete agent edit plan to a clone of the snapshot. Operations are
 * all-or-nothing: any invalid clip, overlap, range, or final state throws before
 * the caller persists a revision.
 */
export function applyEditorOperations(
  state: EditorStateSnapshot,
  operations: readonly EditorEditOperation[]
): EditorEditResult {
  let next = structuredClone(state);
  const previousDuration = getEditorDuration(next);
  const affected = new Set<string>();
  const warnings: string[] = [];

  for (const operation of operations) {
    switch (operation.type) {
      case "remove_ranges": {
        const ranges = normalizeRanges(operation.ranges);
        for (const range of ranges.slice().reverse()) {
          next.timelineSegments = removeRangeFromSegments(next.timelineSegments, range, affected);
          next.subtitles = removeRangeFromSubtitles(next.subtitles, range);
          next.textOverlays = removeRangeFromTimed(next.textOverlays ?? [], range);
          next.zoomEffects = removeRangeFromTimed(next.zoomEffects, range);
          next.speedEffects = removeRangeFromTimed(next.speedEffects, range);
          next.trimRange = removeRangeFromTrim(next.trimRange, range);
        }
        break;
      }
      case "split_clip": {
        const index = findSegmentIndex(next, operation.segmentId);
        const target = next.timelineSegments[index];
        requireRange(operation.at, target.start + 0.1, target.end - 0.1, "split time");
        const right: TimelineSegment = {
          ...target,
          id: `${target.itemId}:segment-agent-${createRuntimeId()}`,
          start: operation.at,
          sourceStart: target.sourceStart + operation.at - target.start
        };
        next.timelineSegments.splice(index, 1, { ...target, end: operation.at }, right);
        affected.add(target.id);
        affected.add(right.id);
        break;
      }
      case "trim_clip": {
        const index = findSegmentIndex(next, operation.segmentId);
        const target = next.timelineSegments[index];
        const start = operation.timelineStart ?? target.start;
        const end = operation.timelineEnd ?? target.end;
        if (start < 0 || end - start < 0.1 || start >= target.end || end <= target.start) {
          throw new Error(`Invalid trim for clip "${target.id}".`);
        }
        next.timelineSegments[index] = {
          ...target,
          start,
          end,
          sourceStart: Math.max(0, target.sourceStart + start - target.start)
        };
        affected.add(target.id);
        break;
      }
      case "delete_clip": {
        const index = findSegmentIndex(next, operation.segmentId);
        const target = next.timelineSegments[index];
        next.timelineSegments.splice(index, 1);
        affected.add(target.id);
        if (operation.ripple) rippleAfterDeletedClip(next, target);
        break;
      }
      case "move_clip": {
        const index = findSegmentIndex(next, operation.segmentId);
        const target = next.timelineSegments[index];
        const start = Math.max(0, operation.timelineStart);
        next.timelineSegments[index] = {
          ...target,
          start,
          end: start + target.end - target.start,
          lane: target.track === "audio" ? Math.max(0, Math.floor(operation.lane ?? target.lane)) : 0
        };
        affected.add(target.id);
        break;
      }
      case "sequence_clips":
        sequenceClips(next, operation, affected, warnings);
        break;
      case "set_audio": {
        if (!Number.isFinite(operation.gainDb) || operation.gainDb < -60 || operation.gainDb > 12) {
          throw new Error("Audio gain must be between -60 dB and +12 dB.");
        }
        next.audioLevels[operation.itemId] = {
          volume: Math.round(Math.pow(10, operation.gainDb / 20) * 10000) / 100,
          muted: operation.muted
        };
        break;
      }
      case "set_audio_lane": {
        next.audioLevels[getAudioLaneLevelKey(operation.lane)] = {
          volume: gainDbToVolume(operation.gainDb),
          muted: operation.muted
        };
        break;
      }
      case "set_master_volume":
        next.masterVolume = operation.volume;
        break;
      case "set_background_audio":
        next.backgroundAudioIds = [...new Set(operation.itemIds)];
        break;
      case "set_layout":
        next.layoutMode = operation.layoutMode;
        break;
      case "set_background":
        next.backgroundStyle = operation.style;
        next.activeBackgroundCategory = operation.category;
        next.customBackgroundImportId = operation.style === "custom"
          ? operation.customImportId ?? next.customBackgroundImportId
          : null;
        if (operation.style === "custom" && !next.customBackgroundImportId) {
          throw new Error("A custom background requires an imported image ID.");
        }
        break;
      case "set_camera":
        if (operation.size !== undefined) next.cameraSize = operation.size;
        if (operation.position !== undefined) next.cameraPosition = operation.position;
        if (operation.shape !== undefined) next.cameraShape = operation.shape;
        if (operation.borderStyle !== undefined) next.cameraBorderStyle = operation.borderStyle;
        if (operation.contentTransform !== undefined) next.cameraContentTransform = structuredClone(operation.contentTransform);
        if (operation.frame !== undefined) next.cameraFrame = structuredClone(operation.frame);
        break;
      case "set_screen":
        if (operation.position !== undefined) next.screenPosition = structuredClone(operation.position);
        if (operation.aspectRatio !== undefined) next.screenAspectRatio = operation.aspectRatio;
        if (operation.cornerStyle !== undefined) next.videoCornerStyle = operation.cornerStyle;
        break;
      case "set_text_overlay":
        if (!isTextOverlay(operation.overlay)) throw new Error("Invalid text overlay.");
        validateEffectRange(operation.overlay, getEditorDuration(next), "Text overlay");
        next.textOverlays = upsertTimedEffect(next.textOverlays ?? [], structuredClone(operation.overlay));
        break;
      case "remove_text_overlay": {
        const overlays = next.textOverlays ?? [];
        if (!overlays.some((overlay) => overlay.id === operation.id)) {
          throw new Error(`Unknown text overlay "${operation.id}".`);
        }
        next.textOverlays = overlays.filter((overlay) => overlay.id !== operation.id);
        break;
      }
      case "set_subtitle_preferences":
        if (operation.language !== undefined) next.subtitleLanguage = operation.language;
        if (operation.style !== undefined) next.subtitleStyle = operation.style;
        break;
      case "set_editor_view":
        if (operation.previewQuality !== undefined) next.previewQuality = operation.previewQuality;
        if (operation.timelineZoom !== undefined) next.timelineZoom = operation.timelineZoom;
        if (operation.previewZoom !== undefined) next.previewZoom = operation.previewZoom;
        break;
      case "import_media":
        next.pendingMediaImport = {
          requestId: createRuntimeId(),
          paths: [...operation.paths],
          placement: operation.placement,
          timelineStart: operation.timelineStart ?? 0
        };
        warnings.push("Media import was queued for the open editor.");
        break;
      case "generate_music":
        next.pendingMusicGeneration = {
          requestId: createRuntimeId(),
          engine: operation.engine,
          prompt: operation.prompt.trim(),
          lyrics: operation.lyrics ?? ""
        };
        warnings.push("Music generation was queued for the open editor.");
        break;
      case "set_zoom": {
        const effect: ZoomEffect = {
          id: operation.id,
          start: operation.start,
          end: operation.end,
          speed: operation.speed,
          easing: operation.easing,
          bezier: operation.bezier,
          scale: operation.scale,
          targetX: operation.targetX,
          targetY: operation.targetY
        };
        validateEffectRange(effect, getEditorDuration(next), "Zoom");
        if (effect.scale < 1 || effect.scale > 4) throw new Error("Zoom scale must be between 1x and 4x.");
        if (effect.targetX < 0 || effect.targetX > 100 || effect.targetY < 0 || effect.targetY > 100) {
          throw new Error("Zoom target coordinates must be percentages between 0 and 100.");
        }
        if (effect.bezier?.some((point) => !finite(point) || point < 0 || point > 1)) {
          throw new Error("Zoom Bézier points must be between 0 and 1.");
        }
        next.zoomEffects = upsertTimedEffect(next.zoomEffects, effect);
        validateNonOverlappingEffects(next.zoomEffects, "Zoom");
        addClipsInRange(next.timelineSegments, effect.start, effect.end, affected);
        break;
      }
      case "remove_zoom": {
        const index = next.zoomEffects.findIndex((item) => item.id === operation.id);
        if (index < 0) throw new Error(`Unknown zoom effect "${operation.id}".`);
        const [removed] = next.zoomEffects.splice(index, 1);
        addClipsInRange(next.timelineSegments, removed.start, removed.end, affected);
        break;
      }
      case "set_speed": {
        const effect: SpeedEffect = {
          id: operation.id,
          start: operation.start,
          end: operation.end,
          rate: operation.rate
        };
        validateEffectRange(effect, getEditorDuration(next), "Speed");
        if (![1, 2, 3, 4, 5].includes(effect.rate)) throw new Error("Speed rate must be from 1x to 5x.");
        next.speedEffects = upsertTimedEffect(next.speedEffects, effect);
        validateNonOverlappingEffects(next.speedEffects, "Speed");
        addClipsInRange(next.timelineSegments, effect.start, effect.end, affected);
        break;
      }
      case "remove_speed": {
        const index = next.speedEffects.findIndex((item) => item.id === operation.id);
        if (index < 0) throw new Error(`Unknown speed effect "${operation.id}".`);
        const [removed] = next.speedEffects.splice(index, 1);
        addClipsInRange(next.timelineSegments, removed.start, removed.end, affected);
        break;
      }
      case "set_transition": {
        const transition: ClipTransition = {
          id: `${operation.fromSegmentId}:${operation.toSegmentId}:transition`,
          fromSegmentId: operation.fromSegmentId,
          toSegmentId: operation.toSegmentId,
          type: operation.transition,
          duration: operation.duration
        };
        const current = next.transitions ?? [];
        next.transitions = [
          ...current.filter((item) =>
            item.fromSegmentId !== operation.fromSegmentId || item.toSegmentId !== operation.toSegmentId
          ),
          transition
        ];
        validateClipTransitions(next.timelineSegments, next.transitions);
        affected.add(operation.fromSegmentId);
        affected.add(operation.toSegmentId);
        break;
      }
      case "remove_transition":
        next.transitions = (next.transitions ?? []).filter((item) =>
          item.fromSegmentId !== operation.fromSegmentId || item.toSegmentId !== operation.toSegmentId
        );
        affected.add(operation.fromSegmentId);
        affected.add(operation.toSegmentId);
        break;
      case "replace_subtitles":
        if (!operation.segments.every(isSubtitleSegment)) throw new Error("Invalid subtitle segments.");
        next.subtitles = structuredClone(operation.segments);
        next.subtitleLanguage = operation.language;
        next.subtitleStyle = operation.style;
        break;
      case "update_subtitle": {
        const index = next.subtitles.findIndex((item) => item.id === operation.id);
        if (index < 0) throw new Error(`Unknown subtitle "${operation.id}".`);
        const updated = { ...next.subtitles[index], ...operation } as SubtitleSegment & { type?: string };
        delete updated.type;
        if (!isSubtitleSegment(updated)) throw new Error(`Invalid subtitle update for "${operation.id}".`);
        if (operation.text !== undefined) delete updated.words;
        next.subtitles[index] = updated;
        break;
      }
      case "set_export_range":
        if (operation.start < 0 || operation.end <= operation.start) throw new Error("Invalid export range.");
        next.trimRange = { start: operation.start, end: operation.end };
        break;
    }
  }

  validateFinalState(next);
  return {
    state: next,
    affectedClipIds: [...affected],
    warnings,
    previousDuration,
    duration: getEditorDuration(next)
  };
}

function validateEffectRange(
  effect: { start: number; end: number },
  timelineDuration: number,
  label: string
): void {
  if (!finite(effect.start) || !finite(effect.end) || effect.start < 0 || effect.end - effect.start < 0.2) {
    throw new Error(`${label} effects require a range of at least 0.2 seconds.`);
  }
  if (timelineDuration <= 0 || effect.end > timelineDuration + 0.01) {
    throw new Error(`${label} effects must stay inside the video timeline.`);
  }
}

function upsertTimedEffect<T extends { id: string }>(items: T[], effect: T): T[] {
  const index = items.findIndex((item) => item.id === effect.id);
  if (index < 0) return [...items, effect];
  return items.map((item, itemIndex) => itemIndex === index ? effect : item);
}

function validateNonOverlappingEffects(
  items: Array<{ id: string; start: number; end: number }>,
  label: string
): void {
  const ordered = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].start < ordered[index - 1].end - 0.01) {
      throw new Error(`${label} effects "${ordered[index - 1].id}" and "${ordered[index].id}" overlap.`);
    }
  }
}

function addClipsInRange(
  segments: TimelineSegment[],
  start: number,
  end: number,
  affected: Set<string>
): void {
  for (const segment of segments) {
    if (segment.start < end && segment.end > start) affected.add(segment.id);
  }
}

function rippleAfterDeletedClip(state: EditorStateSnapshot, target: TimelineSegment): void {
  const length = target.end - target.start;
  state.timelineSegments = state.timelineSegments.map((segment) =>
    segment.start >= target.end ? shiftSegment(segment, -length) : segment
  );
  state.subtitles = shiftTimedAfter(state.subtitles, target.end, -length);
  state.textOverlays = shiftTimedAfter(state.textOverlays ?? [], target.end, -length);
  state.zoomEffects = shiftTimedAfter(state.zoomEffects, target.end, -length);
  state.speedEffects = shiftTimedAfter(state.speedEffects, target.end, -length);
  state.trimRange = shiftTrimAfter(state.trimRange, target.end, -length);
}

function sequenceClips(
  state: EditorStateSnapshot,
  operation: Extract<EditorEditOperation, { type: "sequence_clips" }>,
  affected: Set<string>,
  warnings: string[]
): void {
  let cursor = Math.max(0, operation.start);
  const ids = new Set(operation.segmentIds);
  if (ids.size !== operation.segmentIds.length) throw new Error("sequence_clips contains duplicate IDs.");
  const mappings: TimelineMapping[] = [];
  for (const id of operation.segmentIds) {
    const index = findSegmentIndex(state, id);
    const target = state.timelineSegments[index];
    if (target.track !== "video") throw new Error(`Clip "${id}" is not a video clip.`);
    const duration = target.end - target.start;
    mappings.push({ oldStart: target.start, oldEnd: target.end, newStart: cursor });
    state.timelineSegments[index] = { ...target, start: cursor, end: cursor + duration, lane: 0 };
    cursor += duration + Math.max(0, operation.gap);
    affected.add(id);
  }
  state.subtitles = remapSubtitleItems(state.subtitles, mappings);
  state.timelineSegments = [
    ...state.timelineSegments.filter((segment) => segment.track !== "audio" || !isProjectLinkedAudioId(segment.itemId)),
    ...remapLinkedAudio(
      state.timelineSegments.filter((segment) => segment.track === "audio" && isProjectLinkedAudioId(segment.itemId)),
      mappings
    )
  ];
  for (const segment of state.timelineSegments) {
    if (segment.track === "video" && !ids.has(segment.id)) {
      warnings.push(`Video clip "${segment.id}" was not included in the requested sequence.`);
    }
  }
}

function validateFinalState(state: EditorStateSnapshot): void {
  validateTimeline(state.timelineSegments);
  validateClipTransitions(state.timelineSegments, state.transitions ?? []);
  if (!validateEditorStateSnapshot(state)) throw new Error("The edit plan produced an invalid editor state.");
  const duration = getEditorDuration(state);
  if (duration <= 0) return;
  if (state.trimRange.start >= duration) {
    throw new Error("The export range starts after the end of the edited timeline.");
  }
  if (state.trimRange.end > duration) state.trimRange.end = duration;
  if (state.trimRange.end > 0 && state.trimRange.end <= state.trimRange.start) {
    throw new Error("The export range is empty after applying the edit plan.");
  }
}

/**
 * Drops transition references that are no longer valid after manual clip
 * moves, trims, splits, or deletions. The editor uses this as housekeeping;
 * MCP plans instead fail atomically when they leave an invalid transition.
 */
export function sanitizeClipTransitions(
  segments: TimelineSegment[],
  transitions: readonly ClipTransition[]
): ClipTransition[] {
  const accepted: ClipTransition[] = [];
  for (const transition of transitions) {
    try {
      validateClipTransitions(segments, [...accepted, transition]);
      accepted.push(transition);
    } catch {
      // A stale transition is disposable metadata; the clips remain untouched.
    }
  }
  return accepted;
}

export function validateClipTransitions(
  segments: TimelineSegment[],
  transitions: readonly ClipTransition[]
): void {
  const videos = segments.filter((item) => item.track === "video").sort((a, b) => a.start - b.start);
  const indexById = new Map(videos.map((segment, index) => [segment.id, index]));
  const handleUsage = new Map<string, { incoming: number; outgoing: number }>();
  const boundaries = new Set<string>();

  for (const transition of transitions) {
    if (!Number.isFinite(transition.duration) || transition.duration < 0.1 || transition.duration > 2) {
      throw new Error("Transition duration must be between 0.1 and 2 seconds.");
    }
    const fromIndex = indexById.get(transition.fromSegmentId);
    const toIndex = indexById.get(transition.toSegmentId);
    if (fromIndex === undefined || toIndex !== fromIndex + 1) {
      throw new Error("Transitions must connect adjacent video clips in timeline order.");
    }
    const from = videos[fromIndex];
    const to = videos[toIndex];
    if (Math.abs(from.end - to.start) > 0.05) {
      throw new Error("Transitions require clips that meet at the same cut without a gap.");
    }
    const boundary = `${from.id}\u0000${to.id}`;
    if (boundaries.has(boundary)) throw new Error("A cut can contain only one transition.");
    boundaries.add(boundary);
    const fromUsage = handleUsage.get(from.id) ?? { incoming: 0, outgoing: 0 };
    const toUsage = handleUsage.get(to.id) ?? { incoming: 0, outgoing: 0 };
    fromUsage.outgoing = transition.duration / 2;
    toUsage.incoming = transition.duration / 2;
    handleUsage.set(from.id, fromUsage);
    handleUsage.set(to.id, toUsage);
  }

  for (const segment of videos) {
    const usage = handleUsage.get(segment.id);
    if (usage && usage.incoming + usage.outgoing > segment.end - segment.start - 0.1) {
      throw new Error(`Clip "${segment.id}" is too short for its transitions.`);
    }
  }
}

type TimelineRange = { start: number; end: number };
type TimelineMapping = { oldStart: number; oldEnd: number; newStart: number };

function normalizeRanges(ranges: TimelineRange[]): TimelineRange[] {
  const sorted = ranges.map((range) => {
    if (!finite(range.start) || !finite(range.end) || range.start < 0 || range.end <= range.start) {
      throw new Error("Removal ranges must have finite start/end values and positive duration.");
    }
    return { ...range };
  }).sort((a, b) => a.start - b.start);
  const merged: TimelineRange[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push(range);
  }
  return merged;
}

function removeRangeFromSegments(
  segments: TimelineSegment[],
  range: TimelineRange,
  affected: Set<string>
): TimelineSegment[] {
  const length = range.end - range.start;
  return segments.flatMap((segment): TimelineSegment[] => {
    if (segment.end <= range.start) return [segment];
    if (segment.start >= range.end) return [shiftSegment(segment, -length)];
    affected.add(segment.id);
    const leftDuration = Math.max(0, range.start - segment.start);
    const rightDuration = Math.max(0, segment.end - range.end);
    const result: TimelineSegment[] = [];
    if (leftDuration >= 0.1) result.push({ ...segment, end: range.start });
    if (rightDuration >= 0.1) result.push({
      ...segment,
      id: leftDuration >= 0.1 ? `${segment.itemId}:segment-agent-${createRuntimeId()}` : segment.id,
      start: range.start,
      end: range.start + rightDuration,
      sourceStart: segment.sourceStart + range.end - segment.start
    });
    return result;
  });
}

function removeRangeFromTimed<T extends { id: string; start: number; end: number }>(
  items: T[],
  range: TimelineRange
): T[] {
  const length = range.end - range.start;
  return items.flatMap((item): T[] => {
    if (item.end <= range.start) return [item];
    if (item.start >= range.end) return [{ ...item, start: item.start - length, end: item.end - length }];
    const start = Math.min(item.start, range.start);
    const end = Math.max(start, item.end - Math.min(length, Math.max(0, item.end - range.start)));
    return end - start >= 0.05 ? [{ ...item, start, end }] : [];
  });
}

function removeRangeFromSubtitles(items: SubtitleSegment[], range: TimelineRange): SubtitleSegment[] {
  return removeRangeFromTimed(items, range).map((subtitle) => {
    if (!subtitle.words) return subtitle;
    const words = subtitle.words.flatMap((word): SubtitleWord[] => {
      if (word.end <= range.start) return [word];
      if (word.start >= range.end) {
        return [{ ...word, start: word.start - (range.end - range.start), end: word.end - (range.end - range.start) }];
      }
      const start = Math.min(word.start, range.start);
      const end = Math.max(start, word.end - Math.min(range.end - range.start, Math.max(0, word.end - range.start)));
      return end - start >= 0.03 ? [{ ...word, start, end }] : [];
    });
    return { ...subtitle, words, text: words.length > 0 ? words.map((word) => word.text).join(" ") : subtitle.text };
  });
}

function shiftTimedAfter<T extends { start: number; end: number }>(items: T[], after: number, delta: number): T[] {
  return items.map((item) => item.start >= after ? { ...item, start: item.start + delta, end: item.end + delta } : item);
}

function removeRangeFromTrim(trim: TrimRange, range: TimelineRange): TrimRange {
  return { start: mapRippleTime(trim.start, range), end: mapRippleTime(trim.end, range) };
}

function shiftTrimAfter(trim: TrimRange, after: number, delta: number): TrimRange {
  return {
    start: trim.start >= after ? Math.max(0, trim.start + delta) : trim.start,
    end: trim.end >= after ? Math.max(0, trim.end + delta) : trim.end
  };
}

function mapRippleTime(time: number, range: TimelineRange): number {
  if (time <= range.start) return time;
  if (time >= range.end) return time - (range.end - range.start);
  return range.start;
}

function remapSubtitleItems(items: SubtitleSegment[], mappings: TimelineMapping[]): SubtitleSegment[] {
  return items.flatMap((item) => mappings.flatMap((mapping, mappingIndex): SubtitleSegment[] => {
    const start = Math.max(item.start, mapping.oldStart);
    const end = Math.min(item.end, mapping.oldEnd);
    if (end - start < 0.05) return [];
    const delta = mapping.newStart - mapping.oldStart;
    return [{
      ...item,
      id: mappingIndex === 0 ? item.id : `${item.id}-sequence-${mappingIndex}`,
      start: mapping.newStart + start - mapping.oldStart,
      end: mapping.newStart + end - mapping.oldStart,
      words: item.words?.filter((word) => word.end > start && word.start < end).map((word) => ({
        ...word,
        start: Math.max(start, word.start) + delta,
        end: Math.min(end, word.end) + delta
      }))
    }];
  }));
}

function remapLinkedAudio(segments: TimelineSegment[], mappings: TimelineMapping[]): TimelineSegment[] {
  return segments.flatMap((segment) => mappings.flatMap((mapping, mappingIndex): TimelineSegment[] => {
    const sourceTimelineStart = Math.max(segment.start, mapping.oldStart);
    const sourceTimelineEnd = Math.min(segment.end, mapping.oldEnd);
    if (sourceTimelineEnd - sourceTimelineStart < 0.1) return [];
    const start = mapping.newStart + sourceTimelineStart - mapping.oldStart;
    return [{
      ...segment,
      id: `${segment.id}-sequence-${mappingIndex}`,
      start,
      end: start + sourceTimelineEnd - sourceTimelineStart,
      sourceStart: segment.sourceStart + sourceTimelineStart - segment.start
    }];
  }));
}

function isProjectLinkedAudioId(itemId: string): boolean {
  return itemId.endsWith(":audio") || itemId.endsWith(":system-audio");
}

function shiftSegment(segment: TimelineSegment, delta: number): TimelineSegment {
  return { ...segment, start: Math.max(0, segment.start + delta), end: Math.max(0.1, segment.end + delta) };
}

function findSegmentIndex(state: EditorStateSnapshot, id: string): number {
  const index = state.timelineSegments.findIndex((item) => item.id === id);
  if (index < 0) throw new Error(`Unknown timeline clip "${id}".`);
  return index;
}

function validateTimeline(segments: TimelineSegment[]): void {
  for (const segment of segments) {
    if (!isTimelineSegment(segment) || segment.start < 0 || segment.end - segment.start < 0.1) {
      throw new Error(`Invalid timeline clip "${segment.id}".`);
    }
  }
  const videos = segments.filter((item) => item.track === "video").sort((a, b) => a.start - b.start);
  for (let index = 1; index < videos.length; index += 1) {
    if (videos[index].start < videos[index - 1].end - 0.01) {
      throw new Error(`Video clips "${videos[index - 1].id}" and "${videos[index].id}" overlap.`);
    }
  }
}

function isTimelineSegment(value: unknown): value is TimelineSegment {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const segment = value as Record<string, unknown>;
  return typeof segment.id === "string" && typeof segment.itemId === "string" &&
    (segment.track === "video" || segment.track === "audio") && Number.isInteger(segment.lane) &&
    finite(segment.start) && finite(segment.end) && segment.end >= segment.start && finite(segment.sourceStart);
}

function requireRange(value: number, min: number, max: number, label: string): void {
  if (!finite(value) || value < min || value > max) throw new Error(`Invalid ${label}.`);
}

function gainDbToVolume(gainDb: number): number {
  return Math.round(Math.pow(10, gainDb / 20) * 10000) / 100;
}

function createRuntimeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
