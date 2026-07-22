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
  currentTime?: number;
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
      currentTime: input?.currentTime ?? 0,
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

  it("shows timing as read-only because timing is edited on the timeline", async () => {
    const onUpdateSubtitle = vi.fn();
    const host = await renderPanel({
      subtitles: [{ id: "first", start: 40.74, end: 11_111, text: "July 16th." }],
      selectedSubtitleId: "first",
      duration: 90,
      onUpdateSubtitle
    });
    const start = host.querySelector<HTMLOutputElement>('[aria-label="Subtitle start time"]');
    const end = host.querySelector<HTMLOutputElement>('[aria-label="Subtitle end time"]');

    expect(start?.tagName).toBe("OUTPUT");
    expect(start?.textContent).toBe("00:40.740");
    expect(end?.textContent).toBe("03:05:11.000");
    expect(host.querySelector('input[aria-label="Subtitle start time"]')).toBeNull();
    expect(host.textContent).toContain("Adjust timing by dragging the subtitle clip in the timeline");
    expect(onUpdateSubtitle).not.toHaveBeenCalled();
  });

  it("sorts cues by their current timestamps", async () => {
    const host = await renderPanel({
      subtitles: [
        { id: "last", start: 94.708, end: 96.868, text: "Last subtitle" },
        { id: "first", start: 43.44, end: 53.5, text: "First subtitle" },
        { id: "middle", start: 53.5, end: 58.66, text: "Middle subtitle" }
      ]
    });
    const cueIds = [...host.querySelectorAll<HTMLButtonElement>('button[aria-controls^="subtitle-editor-"]')]
      .map((button) => button.getAttribute("aria-controls"));

    expect(cueIds).toEqual([
      "subtitle-editor-first",
      "subtitle-editor-middle",
      "subtitle-editor-last"
    ]);
    expect(
      host.querySelector('[aria-controls="subtitle-editor-first"]')?.getAttribute("aria-expanded")
    ).toBe("true");
  });

  it("marks only the next cue active at an adjacent boundary", async () => {
    const host = await renderPanel({
      subtitles: [
        { id: "first", start: 0, end: 1, text: "First subtitle" },
        { id: "second", start: 1, end: 2, text: "Second subtitle" }
      ],
      currentTime: 1
    });

    expect(
      host.querySelector('[aria-controls="subtitle-editor-first"]')?.getAttribute("aria-current")
    ).toBeNull();
    expect(
      host.querySelector('[aria-controls="subtitle-editor-second"]')?.getAttribute("aria-current")
    ).toBe("true");
  });

  it("grows the current connector and keeps completed connectors filled", async () => {
    const host = await renderPanel({
      subtitles: [
        { id: "first", start: 0, end: 2, text: "First subtitle" },
        { id: "second", start: 10, end: 12, text: "Second subtitle" },
        { id: "third", start: 20, end: 22, text: "Third subtitle" }
      ],
      currentTime: 9.725
    });

    const progress = host.querySelector<HTMLElement>("[data-subtitle-progress]");
    expect(progress).not.toBeNull();
    expect(progress?.style.height).toBe("50%");
    expect(progress?.closest("[data-subtitle-connector]")?.getAttribute("data-subtitle-connector"))
      .toBe("first:second");
    expect(host.querySelectorAll("[data-subtitle-progress]")).toHaveLength(1);

    const activeHost = await renderPanel({
      subtitles: [
        { id: "first", start: 0, end: 2, text: "First subtitle" },
        { id: "second", start: 10, end: 12, text: "Second subtitle" }
      ],
      currentTime: 10.25
    });
    expect(
      activeHost.querySelector('[data-active-subtitle-section="true"]')?.textContent
    ).toContain("Second subtitle");
    const completedProgress = activeHost.querySelector<HTMLElement>("[data-subtitle-progress]");
    expect(completedProgress?.style.height).toBe("100%");
    expect(completedProgress?.closest("[data-subtitle-connector]")?.getAttribute("data-subtitle-connector"))
      .toBe("first:second");
  });
});
