// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AudioPanel } from "../src/renderer/editor/panels/AudioPanel";

describe("AudioPanel cleanup controls", () => {
  it("lets the user choose a speech cleanup preset and strength", () => {
    const html = renderToStaticMarkup(createElement(AudioPanel, {
      masterVolume: 100,
      audioSources: [{ id: "mic", name: "Microphone", kind: "audio", extension: "wav", duration: 10, url: "ovc-media://mic" }],
      audioLevels: {},
      audioCleanup: { mic: { preset: "wind", strength: 60 } },
      onMasterVolumeChange: vi.fn(),
      onAddBackgroundMusic: vi.fn(),
      onSelectItem: vi.fn(),
      onSetAudioLevel: vi.fn(),
      onSetAudioCleanup: vi.fn()
    }));

    expect(html).toContain("Voice cleanup");
    expect(html).toContain("Wind");
    expect(html).toContain('aria-label="Cleanup strength"');
    expect(html).toContain("60%");
  });
});
