import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PermissionOnboarding } from "../src/renderer/PermissionOnboarding";

describe("PermissionOnboarding", () => {
  it("uses a neutral continuation label before macOS media permission prompts", () => {
    const html = renderToStaticMarkup(createElement(PermissionOnboarding, {
      loading: false,
      status: {
        platform: "darwin",
        canDragAppBundle: true,
        screen: "granted",
        camera: "not-determined",
        microphone: "not-determined"
      },
      onOpenGuide: () => undefined,
      onOpenSettings: () => undefined,
      onRefresh: () => undefined,
      onRequestMedia: () => undefined
    }));

    expect(html.match(/>Continue</g)).toHaveLength(2);
    expect(html).not.toMatch(/>Allow</);
    expect(html).toContain("Enable Screen Recording in System Settings");
  });
});
