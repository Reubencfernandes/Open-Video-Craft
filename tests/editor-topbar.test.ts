import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditorTopbar } from "../src/renderer/editor/EditorTopbar";

describe("editor top bar", () => {
  it("renders the export action with the animated green chevron track", () => {
    const html = renderToStaticMarkup(createElement(EditorTopbar, {
      projectName: "Demo",
      exporting: false,
      canExport: true,
      onBackHome: () => undefined,
      onRename: () => undefined,
      onOpenExport: () => undefined,
      onOpenAi: () => undefined,
      onSave: () => undefined
    }));

    expect(html).toContain("data-editor-export-button");
    expect(html).toContain("editor-export-fill");
    expect(html.match(/editor-export-chevron relative/g)).toHaveLength(7);
    expect(html).toContain("Export");
  });
});
