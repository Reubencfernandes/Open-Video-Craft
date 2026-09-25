/**
 * What pressing a media clip does to the selection, independent of React.
 *
 * Clips are selected on pointer-down (the timeline captures the pointer for
 * dragging, so a native click never reaches the clip). Pressing never moves
 * the playhead; only the ruler, empty lane space, and the playhead itself do.
 */
export type TimelineClipPress = {
  /** Selection to apply immediately. */
  ids: string[];
  primaryId: string | null;
  /** Whether this press may turn into a move drag. */
  draggable: boolean;
  /** Keep a marquee selection alive so a group drag can carry it. */
  keepRange: boolean;
  /** A plain press inside a group collapses to the pressed clip on release. */
  collapseOnRelease: boolean;
};

export function resolveTimelineClipPress(
  selectedIds: readonly string[],
  clipId: string,
  additive: boolean
): TimelineClipPress {
  if (additive) {
    const wasSelected = selectedIds.includes(clipId);
    const ids = wasSelected
      ? selectedIds.filter((id) => id !== clipId)
      : [...selectedIds, clipId];
    return {
      ids,
      primaryId: wasSelected ? ids[ids.length - 1] ?? null : clipId,
      draggable: !wasSelected,
      keepRange: false,
      collapseOnRelease: false
    };
  }

  if (selectedIds.length > 1 && selectedIds.includes(clipId)) {
    return {
      ids: [...selectedIds],
      primaryId: clipId,
      draggable: true,
      keepRange: true,
      collapseOnRelease: true
    };
  }

  return {
    ids: [clipId],
    primaryId: clipId,
    draggable: true,
    keepRange: false,
    collapseOnRelease: false
  };
}

/** Pointer travel, in CSS pixels, before a press becomes a drag. */
export const timelineDragThresholdPx = 4;
