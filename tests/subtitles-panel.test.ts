// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubtitlesPanel } from "../src/renderer/editor/panels/SubtitlesPanel";
import type { SubtitleSegment } from "../src/renderer/editor/types";

let root: ReturnType<typeof createRoot> | null = null;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

async function renderPanel(input?: {
  subtitles?: SubtitleSegment[];
  selectedSubtitleId?: string | null;
  duration?: number;
  onSelectSubtitle?: (id: string | null) => void;
  onUpdateSubtitle?: (id: string, updates: Partial<SubtitleSegment>) => void;
}) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const subtitles = input?.subtitles ?? [
    { id: "first", start: 1, end: 3, text: "First subtitle" },
    { id: "second", start: 4, end: 6, text: "Second subtitle" }
  ];

  await act(async () => {
    root?.render(createElement(SubtitlesPanel, {
      sttStatus: "idle",
      sttDownloadProgress: null,
      sttModelLabel: "Whisper base",
      sttProvider: "whisper-local",
      providerKeys: null,
      subtitleLanguage: "English",
      subtitleStyle: "clean",
      subtitles,
      selectedSubtitleId: input?.selectedSubtitleId ?? null,
      selectedSubtitle: subtitles.find((subtitle) => subtitle.id === input?.selectedSubtitleId) ?? subtitles[0] ?? null,
      duration: input?.duration ?? 30,
      currentTime: 0,
      onAddSubtitle: () => undefined,
      onGenerateSubtitles: () => undefined,
      onCancelTranscription: () => undefined,
      onSttProviderChange: () => undefined,
      onCohereLanguageChange: () => undefined,
      onOpenAiSettings: () => undefined,
      onStyleChange: () => undefined,
      onUpdateSubtitle: input?.onUpdateSubtitle ?? (() => undefined),
      onSelectSubtitle: input?.onSelectSubtitle ?? (() => undefined)
    }));
  });
  return host;
}

describe("SubtitlesPanel", () => {
  it("opens the first subtitle by default, switches items, and lets the open item close", async () => {
    const onSelectSubtitle = vi.fn();
    const host = await renderPanel({ onSelectSubtitle });
    const first = host.querySelector<HTMLButtonElement>('[aria-controls="subtitle-editor-first"]');
    const second = host.querySelector<HTMLButtonElement>('[aria-controls="subtitle-editor-second"]');

    expect(first?.getAttribute("aria-expanded")).toBe("true");
    expect(second?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => first?.click());
    expect(first?.getAttribute("aria-expanded")).toBe("false");
    expect(onSelectSubtitle).toHaveBeenLastCalledWith(null);

    await act(async () => second?.click());
    expect(first?.getAttribute("aria-expanded")).toBe("false");
    expect(second?.getAttribute("aria-expanded")).toBe("true");
    expect(onSelectSubtitle).toHaveBeenLastCalledWith("second");

    await act(async () => second?.click());
    expect(second?.getAttribute("aria-expanded")).toBe("false");
    expect(onSelectSubtitle).toHaveBeenLastCalledWith(null);
  });

  it("clamps an edited end time to the media duration", async () => {
    const onUpdateSubtitle = vi.fn();
    const host = await renderPanel({
      subtitles: [{ id: "first", start: 40.74, end: 11_111, text: "July 16th." }],
      selectedSubtitleId: "first",
      duration: 90,
      onUpdateSubtitle
    });
    const endInput = host.querySelector<HTMLInputElement>('[aria-label="Subtitle end time"]');
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;

    await act(async () => {
      endInput?.focus();
      valueSetter?.call(endInput, "999:59.999");
      endInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => endInput?.blur());

    expect(onUpdateSubtitle).toHaveBeenCalledWith("first", { end: 90 });
    expect(endInput?.value).toBe("01:30.000");
  });
});
