/**
 * Reads the `ovc-click-capture` sidecar output for one recording and converts it
 * into the input the pure auto-zoom generator expects.
 *
 * The sidecar timestamps every click on the host clock (`clickHostNs`). A
 * recording starts when the sidecar emits its first event, so the first
 * timestamped event is the anchor: everything else is measured from it. Clicks
 * stay in global Quartz points, the same space as the display bounds, so the
 * generator can normalize them without guessing a scale factor.
 */
import { collectCaptureInput } from "../shared/capture/clicks";
import { parseProtocolV1Line, type ProtocolV1Event } from "../shared/capture/protocol";
import type { AutoZoomDisplay } from "../shared/editor-domain/auto-zoom";

/** Upper bound on stored clicks; a long session cannot grow the file unbounded. */
export const maxRecordedClicks = 20_000;

export interface TimelineClick {
  /** Position on the timeline axis, in seconds from the first captured event. */
  readonly timeSeconds: number;
  readonly xPoints: number;
  readonly yPoints: number;
  readonly displayId: string;
}

export interface ClickCaptureData {
  readonly clicks: TimelineClick[];
  readonly displays: AutoZoomDisplay[];
  /** The recorded display, when the sidecar reported exactly one candidate. */
  readonly displayId: string | null;
  readonly inputPermission: string | null;
}

/** Click data plus why automatic zooms could not be captured, for the UI. */
export interface ClickCaptureResult extends ClickCaptureData {
  readonly warnings: string[];
}

export const emptyClickCapture: ClickCaptureData = {
  clicks: [],
  displays: [],
  displayId: null,
  inputPermission: null
};

function hostNsOf(event: ProtocolV1Event): number | null {
  const raw = event.event === "input.click" ? event.clickHostNs : event.tHostNs;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Parses sidecar JSONL. Malformed or unknown lines are skipped: a partial write
 * at the end of a session must never discard the clicks already recorded.
 */
export function parseClickCaptureLines(jsonl: string): ProtocolV1Event[] {
  const events: ProtocolV1Event[] = [];
  for (const line of jsonl.split(/\r?\n/u)) {
    if (line.trim().length === 0) continue;
    try {
      events.push(parseProtocolV1Line(line));
    } catch {
      // A truncated final line is expected after an interrupted session.
    }
  }
  return events;
}

export function toClickCaptureData(
  events: readonly ProtocolV1Event[],
  recordedDisplayId?: string | null
): ClickCaptureData {
  const snapshot = collectCaptureInput(events);
  const displays: AutoZoomDisplay[] = snapshot.displays.map((display) => ({
    displayId: display.displayId,
    originXPoints: display.originXPoints,
    originYPoints: display.originYPoints,
    widthPoints: display.widthPoints,
    heightPoints: display.heightPoints,
    primary: display.primary
  }));

  const anchors = events
    .map(hostNsOf)
    .filter((value): value is number => value !== null);
  const anchorNs = anchors.length > 0 ? Math.min(...anchors) : null;

  // Clicks are ordered by the sidecar's own sequence so merging stays stable.
  const orderedClicks = [...snapshot.clicks].sort((first, second) => {
    const delta = Number(first.clickHostNs) - Number(second.clickHostNs);
    return delta === 0 ? first.clickIndex - second.clickIndex : delta;
  });

  const clicks: TimelineClick[] = [];
  if (anchorNs !== null) {
    for (const click of orderedClicks) {
      if (clicks.length >= maxRecordedClicks) break;
      const hostNs = Number(click.clickHostNs);
      if (!Number.isFinite(hostNs) || hostNs < anchorNs) continue;
      clicks.push({
        timeSeconds: Math.round((hostNs - anchorNs) / 1e6) / 1000,
        xPoints: click.xPoints,
        yPoints: click.yPoints,
        displayId: click.displayId
      });
    }
  }

  const explicit = recordedDisplayId ?? null;
  const displayId = explicit ??
    (displays.length === 1
      ? displays[0].displayId
      : displays.find((display) => display.primary)?.displayId ?? null);

  return {
    clicks,
    displays,
    displayId,
    inputPermission: snapshot.permission
  };
}

export function readClickCapture(
  jsonl: string,
  recordedDisplayId?: string | null
): ClickCaptureData {
  return toClickCaptureData(parseClickCaptureLines(jsonl), recordedDisplayId);
}
