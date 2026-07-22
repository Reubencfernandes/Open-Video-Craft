// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenVideoCraftApi } from "../src/preload/preload";
import type { SubtitleSegment } from "../src/renderer/editor/types";

const dependencyMocks = vi.hoisted(() => ({
  decodeTimelineAudioMix: vi.fn(() => new Promise<Float32Array>(() => undefined)),
  transcribeAudioInWorker: vi.fn()
}));

vi.mock("../src/renderer/editor/media-utils", () => ({
  decodeTimelineAudioMix: dependencyMocks.decodeTimelineAudioMix
}));
vi.mock("../src/renderer/editor/subtitle-transcription-client", () => ({
  transcribeAudioInWorker: dependencyMocks.transcribeAudioInWorker
}));

import { useSubtitleGeneration } from "../src/renderer/editor/useSubtitleGeneration";

let root: ReturnType<typeof createRoot> | null = null;
let generation: ReturnType<typeof useSubtitleGeneration> | null = null;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  generation = null;
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("useSubtitleGeneration", () => {
  it("clears existing subtitles before local transcription begins", async () => {
    Object.defineProperty(window, "openVideoCraft", {
      configurable: true,
      value: {
        providers: {
          get: vi.fn(async () => ({
            sttProvider: "whisper-local",
            hasCohereKey: false,
            hasGeminiKey: false,
            cohereLanguage: "en",
            encryptionAvailable: true
          })),
          update: vi.fn()
        }
      } as unknown as OpenVideoCraftApi
    });
    const setSubtitles = vi.fn();
    const setSelectedSubtitleId = vi.fn();
    const setSubtitleLanguage = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    function Harness() {
      generation = useSubtitleGeneration({
        audioClips: [],
        videoClips: [{
          id: "video-clip",
          item: {
            id: "screen",
            name: "screen.webm",
            url: "ovc-media://screen",
            kind: "video",
            origin: "project",
            track: "screen",
            duration: 10
          },
          track: "video",
          lane: 0,
          start: 0,
          duration: 10,
          sourceStart: 0
        }],
        audioLevels: {},
        backgroundAudioIds: [],
        setError: vi.fn(),
        setSelectedSubtitleId,
        setSubtitleLanguage,
        setSubtitles
      });
      return null;
    }

    await act(async () => root?.render(createElement(Harness)));
    await act(async () => {
      void generation?.generateSubtitles();
      await new Promise((resolve) => window.setTimeout(resolve, 1));
    });

    expect(setSubtitles).toHaveBeenCalledWith([] as SubtitleSegment[]);
    expect(setSelectedSubtitleId).toHaveBeenCalledWith(null);
    expect(setSubtitleLanguage).toHaveBeenCalledWith(null);
    expect(dependencyMocks.decodeTimelineAudioMix).toHaveBeenCalledOnce();
    expect(generation?.sttStatus).toBe("loading");
  });
});
