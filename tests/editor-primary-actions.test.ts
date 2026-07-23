import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SpeedPanel } from "../src/renderer/editor/panels/SpeedPanel";
import { StylePanel } from "../src/renderer/editor/panels/StylePanel";
import { SubtitlesPanel } from "../src/renderer/editor/panels/SubtitlesPanel";
import { TextPanel } from "../src/renderer/editor/panels/TextPanel";
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

  it("adds text to the viewport and uses shared responsive editor controls", () => {
    const selected = {
      id: "title",
      start: 4.125,
      end: 7.125,
      text: "Product update",
      x: 50,
      y: 24,
      size: 64,
      color: "#ff4b73",
      fontFamily: "rounded" as const,
      opacity: 85,
      weight: 700 as const,
      animation: "pop" as const
    };
    const html = renderToStaticMarkup(createElement(TextPanel, {
      overlays: [selected],
      selectedOverlayId: selected.id,
      selectedOverlay: selected,
      onAdd: () => undefined,
      onSelect: () => undefined,
      onUpdate: () => undefined,
      onRemove: () => undefined
    }));

    expect(html).toContain("data-add-text-to-viewport");
    expect(html).toContain("data-bubble-action-button");
    expect(html).toContain("Add text to viewport");
    expect(html).toContain("data-text-layer-stack");
    expect(html).toContain("data-text-layer-option");
    expect(html).toContain('data-selected="true"');
    expect(html).not.toContain("lucide-type");
    expect(html).not.toContain("Drag onto the timeline");
    expect(html).not.toContain('type="number"');
    expect(html).toContain('aria-label="Text animation"');
    expect(html).toContain('aria-label="Text font"');
    expect(html).toContain('aria-label="Text weight"');
    expect(html).toContain('aria-label="Text hue"');
    expect(html).toContain('aria-label="Text opacity"');
    expect(html.indexOf("Remove text")).toBeLessThan(html.indexOf("Animation"));
  });

  it("only marks the explicitly selected text layer in the layer index", () => {
    const overlay = {
      id: "title",
      start: 1,
      end: 4,
      text: "Readable layer name",
      x: 50,
      y: 50,
      size: 48,
      color: "#ffffff",
      fontFamily: "sans" as const,
      opacity: 100,
      weight: 700 as const,
      animation: "none" as const
    };
    const html = renderToStaticMarkup(createElement(TextPanel, {
      overlays: [overlay],
      selectedOverlayId: null,
      selectedOverlay: overlay,
      onAdd: () => undefined,
      onSelect: () => undefined,
      onUpdate: () => undefined,
      onRemove: () => undefined
    }));

    expect(html).toContain("Readable layer name");
    expect(html).toContain('data-selected="false"');
    expect(html).not.toContain('data-selected="true"');
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
      selectedSubtitleId: null,
      selectedSubtitle: null,
      duration: 0,
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

  it("uses the glowing API-key pill for cloud subtitle setup", () => {
    const html = renderToStaticMarkup(createElement(SubtitlesPanel, {
      sttStatus: "idle",
      sttDownloadProgress: null,
      sttModelLabel: "Gemini",
      sttProvider: "gemini",
      providerKeys: {
        sttProvider: "gemini",
        hasCohereKey: false,
        hasGeminiKey: false,
        cohereLanguage: "en",
        encryptionAvailable: true
      },
      subtitleLanguage: "English",
      subtitleStyle: "clean",
      subtitles: [],
      selectedSubtitleId: null,
      selectedSubtitle: null,
      duration: 0,
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

    expect(html).toContain("data-api-key-prompt");
    expect(html).toContain("Add your Gemini API key to use this model");
    expect(html).toContain("rounded-full");
    expect(html).toContain("border-cyan-300/70");
    expect(html).not.toContain("border-amber-300/70");
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
      { id: "active", start: 3, end: 7, text: "The subtitle currently being played" },
      { id: "next", start: 9, end: 11, text: "The next subtitle" }
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
      selectedSubtitleId: "first",
      selectedSubtitle: subtitles[0],
      duration: 20,
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
    expect(html).toContain("00:03.000 — 00:07.000");
    expect(html).toContain('data-active-subtitle="true"');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('data-subtitle-editor="true"');
    expect(html).toContain('aria-label="Subtitle start time"');
    expect(html).toContain('aria-readonly="true"');
    expect(html).toContain("00:01.000");
    expect(html).not.toContain('input aria-label="Subtitle start time"');
    expect(html).toContain("grid-rows-[1fr] opacity-100");
    expect(html).toContain("duration-300");
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
    expect(html).toContain("Rounded");
    expect(html).toContain("Slight");
    expect(html).not.toContain("Full");
  });
});
