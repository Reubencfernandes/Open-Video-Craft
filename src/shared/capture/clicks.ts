/**
 * Reducer for the optional input-capture events of protocol v1 (`display.metrics`,
 * `input.click`, `input.permission`) as emitted by the `ovc-click-capture`
 * sidecar. It only groups what the sidecar reported: it never converts a host
 * timestamp to timeline seconds, because that mapping needs the same `TimeMap`
 * (pauses included) the importer used for the recorded track.
 */
import type {
  DisplayMetricsEvent,
  InputClickEvent,
  InputMonitoringStatus,
  ProtocolV1Event
} from "./protocol";

export interface CaptureInputSnapshot {
  /** Last Input Monitoring verdict, or null when the sidecar never reported one. */
  readonly permission: InputMonitoringStatus | null;
  readonly displays: readonly DisplayMetricsEvent[];
  readonly clicks: readonly InputClickEvent[];
}

export function collectCaptureInput(events: readonly ProtocolV1Event[]): CaptureInputSnapshot {
  const displays: DisplayMetricsEvent[] = [];
  const clicks: InputClickEvent[] = [];
  let permission: InputMonitoringStatus | null = null;

  for (const event of events) {
    switch (event.event) {
      case "display.metrics":
        displays.push(event);
        break;
      case "input.click":
        clicks.push(event);
        break;
      case "input.permission":
        permission = event.status;
        break;
      default:
        break;
    }
  }

  return { permission, displays, clicks };
}
