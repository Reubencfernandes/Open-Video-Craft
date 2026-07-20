import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatMarkdown } from "../src/renderer/editor/panels/assistant/ChatMarkdown";

describe("ChatMarkdown", () => {
  it("renders GitHub-flavored Markdown and drops unsafe content", () => {
    const html = renderToStaticMarkup(createElement(
      ChatMarkdown,
      null,
      "## Edit plan\n\n- **Trim** silence\n- Keep `intro()`\n\n| Clip | Action |\n| --- | --- |\n| 1 | Cut |\n\n[Docs](https://example.com/help)\n\n[Unsafe](javascript:alert(1))\n\n<script>alert('no')</script>"
    ));

    expect(html).toContain("<h2>Edit plan</h2>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<strong>Trim</strong>");
    expect(html).toContain("<code>intro()</code>");
    expect(html).toContain("<table>");
    expect(html).toContain('href="https://example.com/help"');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script>");
  });
});
