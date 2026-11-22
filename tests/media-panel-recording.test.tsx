// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { MediaPanel } from "../src/renderer/editor/panels/MediaPanel";

describe("MediaPanel recording controls", () => {
  it("shows audio and video recording controls", () => {
    const html = renderToStaticMarkup(createElement(MediaPanel, {
      activeTab: "all",
      visibleMedia: [],
      selectedItemId: null,
      onImport: () => undefined,
      onImportPaths: () => undefined,
      onRecordAudio: () => undefined,
      onRecordVideo: () => undefined,
      recordingKind: null,
      onTabChange: () => undefined,
      onSelectItem: () => undefined,
      onItemDuration: () => undefined,
      onRemoveItem: () => undefined
    }));
    expect(html).toContain("Record microphone clip");
    expect(html).toContain("Record camera and microphone clip");
  });
});
