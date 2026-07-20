import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RecorderControllerView } from "../src/renderer/recorder/RecorderControllerView";
import type { FloatingState } from "../src/renderer/recorder/types";

function renderRecorder(state: FloatingState = "ready", compact = false): string {
  const handler = vi.fn();
  return renderToStaticMarkup(createElement(RecorderControllerView, {
    compact,
    state,
    countdown: 3,
    elapsedMs: 65_000,
    errorMessage: null,
    projectRootPath: null,
    systemAudioEnabled: false,
    selectedSourceName: "Entire screen",
    baseDirectory: null,
    microphones: [],
    cameras: [],
    selectedMicId: null,
    selectedCameraId: null,
    selectedCameraLabel: "Camera",
    micEnabled: false,
    cameraEnabled: false,
    cameraPreviewStream: null,
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
    onScreenQualityChange: handler,
    onCameraQualityChange: handler
  }));
}

describe("recorder controller view", () => {
  it("uses the black and pink recorder surface without a display-border control", () => {
    const html = renderRecorder();

    expect(html).toContain("data-recorder-controller");
    expect(html).toContain("data-recorder-start");
    expect(html).toContain("Screen recorder");
    expect(html).toContain("Entire screen");
    expect(html).toContain("bg-[#ff3b9d]");
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
});
