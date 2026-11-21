// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MatrixPopupHost } from "../src/renderer/popups/MatrixPopupHost";
import { normalizeMatrixPopup } from "../src/renderer/popups/matrix-popup-store";

describe("MatrixPopupHost", () => {
  it("renders title, text and custom styling for a popup", () => {
    const popup = normalizeMatrixPopup({
      title: "SYSTEM",
      text: "Render complete",
      accentColor: "#00ff66",
      fontFamily: "Courier New, monospace",
      position: "top-center"
    }, "popup-1", 1000);

    const html = renderToStaticMarkup(createElement(MatrixPopupHost, {
      popups: [popup],
      onDismiss: () => undefined
    }));

    expect(html).toContain("data-matrix-popup=\"popup-1\"");
    expect(html).toContain("SYSTEM");
    expect(html).toContain("Render complete");
    expect(html).toContain("#00ff66");
    expect(html).toContain("Courier New, monospace");
    expect(html).toContain("data-position=\"top-center\"");
    expect(html).toContain('aria-label="Dismiss notification"');
  });

  it("supports text-only popups without an empty heading", () => {
    const popup = normalizeMatrixPopup({ text: "Saved" }, "popup-2", 1000);
    const html = renderToStaticMarkup(createElement(MatrixPopupHost, {
      popups: [popup],
      onDismiss: () => undefined
    }));

    expect(html).toContain("Saved");
    expect(html).not.toContain("<h2");
    expect(html).toContain("data-phase=\"entering\"");
  });
});
