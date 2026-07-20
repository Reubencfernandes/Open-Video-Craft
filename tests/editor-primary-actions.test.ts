import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SpeedPanel } from "../src/renderer/editor/panels/SpeedPanel";
import { StylePanel } from "../src/renderer/editor/panels/StylePanel";
import { SubtitlesPanel } from "../src/renderer/editor/panels/SubtitlesPanel";
import { ToolRail } from "../src/renderer/editor/ToolRail";
import { ZoomPanel } from "../src/renderer/editor/panels/ZoomPanel";

describe("editor primary actions", () => {
  it("uses one sliding indicator for tool navigation", () => {
    const mediaHtml = renderToStaticMarkup(createElement(ToolRail, {
      activeTool: "media",
      onToolChange: () => undefined
    }));
    const subtitlesHtml = renderToStaticMarkup(createElement(ToolRail, {
      activeTool: "subtitles",
      onToolChange: () => undefined
    }));

    expect(mediaHtml).toContain("data-tool-rail-indicator");
    expect(mediaHtml).toContain("translateY(0rem)");
    expect(subtitlesHtml).toContain("translateY(14.6rem)");
  });

  it("uses the shared pink bubble action for speed, zoom, and subtitle creation", () => {
    const speedHtml = renderToStaticMarkup(createElement(SpeedPanel, {
      selectedSpeedEffect: null,
      onAddSpeed: () => undefined,
      onUpdateSpeed: () => undefined,
      onRemoveSpeed: () => undefined
    }));
    const zoomHtml = renderToStaticMarkup(createElement(ZoomPanel, {
      previewItem: null,
      selectedZoomEffect: null,
      onAddZoom: () => undefined,
      onUpdateZoom: () => undefined,
      onRemoveZoom: () => undefined,
      onPreviewCurve: () => undefined
    }));
    const subtitlesHtml = renderToStaticMarkup(createElement(SubtitlesPanel, {
      sttStatus: "idle",
      sttDownloadProgress: null,
      sttModelLabel: "Whisper base",
      sttProvider: "whisper-local",
      providerKeys: null,
      subtitleLanguage: "English",
      subtitleStyle: "clean",
      subtitles: [],
      selectedSubtitle: null,
      currentTime: 0,
      onAddSubtitle: () => undefined,
      onGenerateSubtitles: () => undefined,
      onCancelTranscription: () => undefined,
      onSttProviderChange: () => undefined,
      onCohereLanguageChange: () => undefined,
      onOpenAiSettings: () => undefined,
      onStyleChange: () => undefined,
      onUpdateSubtitle: () => undefined,
      onSelectSubtitle: () => undefined
    }));

    expect(speedHtml).toContain("data-bubble-action-button");
    expect(speedHtml).toContain("Add speed section");
    expect(zoomHtml).toContain("data-bubble-action-button");
    expect(zoomHtml).toContain("Add smooth zoom");
    expect(subtitlesHtml).toContain("data-bubble-action-button");
    expect(subtitlesHtml).toContain("Add subtitle");
  });

  it("shows the zoom focus as one large solid red dot", () => {
    const html = renderToStaticMarkup(createElement(ZoomPanel, {
      previewItem: null,
      selectedZoomEffect: {
        id: "zoom-1",
        start: 1,
        end: 3,
        speed: "medium",
        scale: 1.8,
        targetX: 42,
        targetY: 58
      },
      onAddZoom: () => undefined,
      onUpdateZoom: () => undefined,
      onRemoveZoom: () => undefined,
      onPreviewCurve: () => undefined
    }));

    const dotMarkup = html.match(/<span[^>]*data-zoom-target-dot[^>]*><\/span>/)?.[0] ?? "";
    expect(dotMarkup).toContain("size-8");
    expect(dotMarkup).toContain("bg-red-500");
    expect(dotMarkup).not.toMatch(/border|white|Crosshair/);
  });

  it("renders subtitle text as a timed hierarchy and marks the playing segment", () => {
    const subtitles = [
      { id: "first", start: 1, end: 3, text: "First complete subtitle line" },
      { id: "active", start: 3, end: 7, text: "The subtitle currently being played" }
    ];
    const html = renderToStaticMarkup(createElement(SubtitlesPanel, {
      sttStatus: "idle",
      sttDownloadProgress: null,
      sttModelLabel: "Whisper base",
      sttProvider: "whisper-local",
      providerKeys: null,
      subtitleLanguage: "English",
      subtitleStyle: "clean",
      subtitles,
      selectedSubtitle: subtitles[0],
      currentTime: 4,
      onAddSubtitle: () => undefined,
      onGenerateSubtitles: () => undefined,
      onCancelTranscription: () => undefined,
      onSttProviderChange: () => undefined,
      onCohereLanguageChange: () => undefined,
      onOpenAiSettings: () => undefined,
      onStyleChange: () => undefined,
      onUpdateSubtitle: () => undefined,
      onSelectSubtitle: () => undefined
    }));

    expect(html).toContain("data-subtitle-timeline");
    expect(html).toContain("00:03 — 00:07");
    expect(html).toContain('data-active-subtitle="true"');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("Playing now");
    expect(html).toContain("The subtitle currently being played");
  });

  it("removes Animated from Style while safely opening older projects", () => {
    const html = renderToStaticMarkup(createElement(StylePanel, {
      activeCategory: "animated",
      backgroundStyle: "animated-1",
      videoCornerStyle: "soft",
      onCategoryChange: () => undefined,
      onBackgroundStyleChange: () => undefined,
      onUploadCustomBackground: () => undefined,
      onCornerStyleChange: () => undefined
    }));

    expect(html).not.toContain("Animated");
    expect(html).not.toContain("Aurora");
    expect(html).toContain("Image");
    expect(html).toContain("Skyline");
    expect(html).toContain("editor-choice-button");
    expect(html).toContain("editor-choice-content");
    expect(html).toContain('aria-pressed="true"');
  });
});
