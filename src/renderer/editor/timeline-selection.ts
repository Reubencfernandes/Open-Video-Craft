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
  additive: boolean,
  groupIds: readonly string[] = []
): TimelineClipPress {
  if (additive) {
    const wasSelected = selectedIds.includes(clipId);
    // A modifier press toggles the whole block the clip belongs to.
    const targets = groupIds.length > 1 ? groupIds : [clipId];
    const ids = wasSelected
      ? selectedIds.filter((id) => !targets.includes(id))
      : [...selectedIds, ...targets.filter((id) => !selectedIds.includes(id))];
    return {
      ids,
      primaryId: wasSelected ? ids[ids.length - 1] ?? null : clipId,
      draggable: !wasSelected,
      keepRange: false,
      collapseOnRelease: false
    };
  }

  // Pressing any clip of a block selects the block; when it is already part of
  // the selection the whole selection keeps moving, as before.
  const blockIds =
    groupIds.length > 1 && !groupIds.every((id) => selectedIds.includes(id))
      ? [...groupIds]
      : null;
  if (blockIds) {
    return {
      ids: blockIds,
      primaryId: clipId,
      draggable: true,
      keepRange: true,
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

/**
 * What a right-click on the timeline acts on.
 *
 * A multi-selection survives a right-click that does not land on another clip:
 * the menu then targets one of the selected clips, so its Split and Delete
 * commands address the whole selection instead of the clip under the cursor.
 */
export type TimelineContextMenuTarget = {
  /** Clip the menu acts on; null when the press hit no clip at all. */
  segmentId: string | null;
  /** Clip that overrides the selection because it was pressed directly. */
  selectId: string | null;
};

export function resolveTimelineContextMenuTarget(params: {
  selectedIds: readonly string[];
  /** Clip whose element was pressed, if any. */
  clipElementId: string | null;
  /** Clip under the pointer time, if any. */
  clipAtTimeId: string | null;
}): TimelineContextMenuTarget {
  const { selectedIds, clipElementId, clipAtTimeId } = params;

  if (clipElementId) {
    const isSelected = selectedIds.includes(clipElementId);
    return { segmentId: clipElementId, selectId: isSelected ? null : clipElementId };
  }

  if (selectedIds.length > 1) {
    const selectedUnderPointer =
      clipAtTimeId !== null && selectedIds.includes(clipAtTimeId) ? clipAtTimeId : null;
    return { segmentId: selectedUnderPointer ?? selectedIds[0], selectId: null };
  }

  return { segmentId: clipAtTimeId, selectId: null };
}
