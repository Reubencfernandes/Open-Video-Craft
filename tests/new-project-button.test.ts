import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NewProjectButton } from "../src/renderer/home/NewProjectButton";

describe("NewProjectButton", () => {
  it("renders a responsive pink halftone action with an accessible name", () => {
    const html = renderToStaticMarkup(createElement(NewProjectButton, {
      disabled: false,
      onClick: () => undefined
    }));

    expect(html).toContain('aria-label="New Project"');
    expect(html).toContain("data-new-project-button");
    expect(html.match(/new-project-bubble"/g)).toHaveLength(26);
    expect(html).toContain("new-project-pixel-belt");
    expect(html).toContain("new-project-pixel-pattern-first");
    expect(html).toContain("new-project-pixel-pattern-second");
    expect(html).not.toContain("new-project-pixel-runner");
    expect(html).not.toContain("new-project-light-sweep");
    expect(html).toContain("focus-visible:ring-2");
    expect(html).toContain("New Project");
  });

  it("preserves the disabled state", () => {
    const html = renderToStaticMarkup(createElement(NewProjectButton, {
      disabled: true,
      onClick: () => undefined
    }));
    expect(html).toContain('disabled=""');
  });
});
