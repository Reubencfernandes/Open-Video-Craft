import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RecorderControllerView } from "../src/renderer/recorder/RecorderControllerView";
import type { FloatingState } from "../src/renderer/recorder/types";

type RecorderViewProps = Parameters<typeof RecorderControllerView>[0];

function renderRecorder(
  state: FloatingState = "ready",
  compact = false,
  overrides: Partial<RecorderViewProps> = {}
): string {
  const handler = vi.fn();
  const props: RecorderViewProps = {
    compact,
    state,
    countdown: 3,
    elapsedMs: 65_000,
    errorMessage: null,
    systemAudioEnabled: false,
    sources: [
      {
        id: "screen:0:0",
        name: "Entire screen",
        kind: "screen",
        displayId: "1",
        thumbnail: "data:image/svg+xml,screen-fallback",
        appIcon: null
      },
      {
        id: "screen:1:0",
        name: "Studio display",
        kind: "screen",
        displayId: "2",
        thumbnail: "data:image/svg+xml,screen2-fallback",
        appIcon: null
      },
      {
        id: "window:1:0",
        name: "Demo window",
        kind: "window",
        displayId: "",
        thumbnail: "data:image/svg+xml,window-fallback",
        appIcon: null
      }
    ],
    sourceThumbnails: {
      "screen:0:0": "data:image/png;base64,real-screen-1",
      "screen:1:0": "data:image/png;base64,real-screen-2"
    },
    selectedSourceIds: ["screen:0:0"],
    baseDirectory: null,
    microphones: [],
    cameras: [
      { deviceId: "camera-1", label: "Face camera" },
      { deviceId: "camera-2", label: "Desk camera" }
    ],
    selectedMicId: null,
    selectedCameraIds: ["camera-1"],
    micEnabled: false,
    cameraEnabled: false,
    cameraPreviewStreams: {},
    screenQuality: "source",
    cameraQuality: "720p",
    canStart: true,
    onSetCompactMode: handler,
    onMinimizeWindow: handler,
    onDismissError: handler,
    onToggleSystemAudio: handler,
    onClose: handler,
    onStartRecording: handler,
    onStopRecording: handler,
    onCancelRecording: handler,
    onPauseRecording: handler,
    onResumeRecording: handler,
    onChooseFolder: handler,
    onToggleMic: handler,
    onMicChange: handler,
    onToggleSource: handler,
    onToggleCamera: handler,
    onToggleCameraDevice: handler,
    onScreenQualityChange: handler,
    onCameraQualityChange: handler,
    ...overrides
  };

  return renderToStaticMarkup(createElement(RecorderControllerView, props));
}

describe("recorder controller view", () => {
  it("shows source cards and the simplified red record control", () => {
    const html = renderRecorder();

    expect(html).toContain("data-recorder-controller");
    expect(html).toContain("data-recorder-start");
    expect(html).toContain("Screen recorder");
    expect(html).toContain('aria-label="Screens and windows to record"');
    expect(html).toContain("Screens");
    expect(html).toContain("Windows");
    expect(html).toContain('data-source-card="screen:0:0"');
    expect(html).toContain('data-source-card="window:1:0"');
    expect(html).toContain("Start recording");
    expect(html).toContain("border-white bg-red-600");
    expect(html).not.toContain("recorder-ready-glow");
    expect(html).not.toMatch(/Show screen border|Hide screen border|violet|cyan/i);
  });

  it("keeps the start button in flow and exposes a resize grip", () => {
    const html = renderRecorder("ready", false, { onResizeWindow: vi.fn() });

    expect(html).toContain("data-recorder-resize-grip");
    expect(html).not.toContain("absolute inset-x-2 top-2");
    expect(html).toContain("z-30 grid flex-none justify-items-center");
  });

  it("renders every screen with a real thumbnail and marks the selected ones", () => {
    const html = renderRecorder("ready", false, {
      selectedSourceIds: ["screen:0:0", "screen:1:0"]
    });

    expect(html).toContain('src="data:image/png;base64,real-screen-1"');
    expect(html).toContain('src="data:image/png;base64,real-screen-2"');
    expect(html).toContain('src="data:image/svg+xml,window-fallback"');
    expect(html).toContain('data-source-card="screen:0:0" aria-pressed="true"');
    expect(html).toContain('data-source-card="screen:1:0" aria-pressed="true"');
    expect(html).toContain('data-source-card="window:1:0" aria-pressed="false"');
  });

  it("keeps a single selected screen preselected for legacy single-source recording", () => {
    const html = renderRecorder();

    expect(html).toContain('data-source-card="screen:0:0" aria-pressed="true"');
    expect(html).toContain('data-source-card="screen:1:0" aria-pressed="false"');
    // The grid card is the preview: a second single-source card duplicated it
    // and pushed the camera preview under the selector.
    expect(html).not.toContain("data-selected-source-preview");
    expect(html).toContain('src="data:image/png;base64,real-screen-1"');
  });

  it("renders every webcam as a large source card like screens and windows", () => {
    const html = renderRecorder("ready", false, {
      cameraEnabled: true,
      selectedCameraIds: ["camera-1"],
      cameraPreviewStreams: {
        "camera-1": { id: "face" } as unknown as MediaStream,
        "camera-2": { id: "desk" } as unknown as MediaStream
      }
    });

    expect(html).toContain('aria-label="Cameras to record"');
    expect(html).toContain("data-camera-card=\"camera-1\" aria-pressed=\"true\"");
    expect(html).toContain("data-camera-card=\"camera-2\" aria-pressed=\"false\"");
    expect(html).toContain('aria-label="Record camera Face camera"');
    expect(html).toContain('aria-label="Record camera Desk camera"');
    // The card carries the live feed and uses the same card surface as the
    // screen/window grid instead of a small inline video beside a checkbox.
    expect(html).toContain('aria-label="Camera Face camera preview"');
    expect(html).toContain('aria-label="Camera Desk camera preview"');
    expect(html).toContain("aspect-video w-full rounded object-cover");
  });

  it("shows an animated recording state with elapsed time and clear controls", () => {
    const html = renderRecorder("recording");

    expect(html).toContain("Recording in progress");
    expect(html).toContain("01:05");
    expect(html).toContain("data-pixel-timer");
    expect(html).toContain("recorder-recording-dot");
    expect(html).toContain("Pause");
    expect(html).toContain("Cancel");
    expect(html).toContain("Done");
  });

  it("shows a microphone level meter before and during recording", () => {
    const idle = renderRecorder();
    const recording = renderRecorder("recording");

    expect(idle).toContain('aria-label="Microphone level"');
    expect(idle).toContain("data-microphone-meter=\"0\"");
    expect(recording).toContain('aria-label="Microphone level"');
  });

  it("keeps the docked recording controls when a camera feed is live", () => {
    const html = renderRecorder("recording", false, {
      cameraEnabled: true,
      selectedCameraIds: ["camera-1"],
      cameraPreviewStreams: {
        "camera-1": { id: "face" } as unknown as MediaStream
      }
    });

    expect(html).toContain("Recording in progress");
    expect(html).toContain("Done");
    expect(html).toContain("w-full rounded-2xl bg-[#101012]");
    expect(html).not.toContain("data-camera-picker");
  });

  it("does not render the redundant full-panel webcam preview any more", () => {
    const html = renderRecorder("ready", false, {
      cameraEnabled: true,
      selectedCameraIds: ["camera-1"],
      cameraPreviewStreams: {
        "camera-1": { id: "face" } as unknown as MediaStream
      }
    });

    expect(html).not.toContain('aria-label="Camera preview"');
    expect(html).not.toContain("pointer-events-none absolute inset-0 size-full");
    expect(html).not.toContain("data-selected-source-preview");
  });
});
