import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RecorderControllerView } from "../src/renderer/recorder/RecorderControllerView";
import type { FloatingState } from "../src/renderer/recorder/types";

function renderRecorder(
  state: FloatingState = "ready",
  compact = false,
  cameraPreview = false
): string {
  const handler = vi.fn();
  return renderToStaticMarkup(createElement(RecorderControllerView, {
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
        thumbnail: "data:image/svg+xml,screen",
        appIcon: null
      },
      {
        id: "window:1:0",
        name: "Demo window",
        kind: "window",
        displayId: "",
        thumbnail: "data:image/svg+xml,window",
        appIcon: null
      }
    ],
    selectedSourceId: "screen:0:0",
    baseDirectory: null,
    microphones: [],
    cameras: [],
    selectedMicId: null,
    selectedCameraId: null,
    selectedCameraLabel: "Camera",
    micEnabled: false,
    cameraEnabled: false,
    cameraPreviewStream: cameraPreview ? ({} as MediaStream) : null,
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
    onToggleCamera: handler,
    onMicChange: handler,
    onCameraChange: handler,
    onSourceChange: handler,
    onScreenQualityChange: handler,
    onCameraQualityChange: handler
  }));
}

describe("recorder controller view", () => {
  it("shows source selection and the simplified red record control", () => {
    const html = renderRecorder();

    expect(html).toContain("data-recorder-controller");
    expect(html).toContain("data-recorder-start");
    expect(html).toContain("Screen recorder");
    expect(html).toContain('aria-label="Screen or window to record"');
    expect(html).toContain('<optgroup label="Screens">');
    expect(html).toContain("Entire screen");
    expect(html).toContain("Demo window");
    expect(html).toContain("Start recording");
    expect(html).toContain("border-white bg-red-600");
    expect(html).not.toContain("recorder-ready-glow");
    expect(html).not.toContain("Screen, camera, microphone, and system audio");
    expect(html).not.toMatch(/Show screen border|Hide screen border|violet|cyan/i);
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

  it("renders the camera preview as the full central-panel background", () => {
    const html = renderRecorder("ready", false, true);

    expect(html).toContain('aria-label="Camera preview"');
    expect(html).toContain("pointer-events-none absolute inset-0 size-full");
    expect(html).toContain("linear-gradient");
  });
});
