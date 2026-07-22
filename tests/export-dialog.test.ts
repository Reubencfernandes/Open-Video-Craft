import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExportDialog } from "../src/renderer/editor/ExportDialog";

describe("ExportDialog", () => {
  it("uses a wide compact layout without the export explanation card", () => {
    const html = renderToStaticMarkup(createElement(ExportDialog, {
      exportFormat: "mp4",
      exportResolution: "1080p",
      exportSubtitleMode: "burn-in",
      exporting: false,
      exportProgress: null,
      hasSubtitles: true,
      onClose: () => undefined,
      onCancelExport: () => undefined,
      onExport: () => undefined,
      onFormatChange: () => undefined,
      onResolutionChange: () => undefined,
      onSubtitleModeChange: () => undefined
    }));

    expect(html).toContain("w-[min(94vw,620px)]");
    expect(html).toContain("z-[80]");
    expect(html).toContain("min-[420px]:grid-cols-2");
    expect(html).toContain("min-[420px]:col-span-2");
    expect(html).toContain("Resolution");
    expect(html).toContain("Subtitles");
    expect(html).toContain("Format");
    expect(html).not.toContain("What this export includes");
    expect(html).not.toContain("Timeline cuts, reordered clips");
    expect(html).not.toContain("remain preview-only");
  });
});
