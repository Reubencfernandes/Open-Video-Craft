import { describe, expect, it } from "vitest";
import { shouldEnableDevTools } from "../src/main/dev-tools";

describe("developer tools policy", () => {
  it("enables developer tools in installed Windows builds", () => {
    expect(
      shouldEnableDevTools({ isPackaged: true, platform: "win32" })
    ).toBe(true);
  });

  it("keeps installed macOS builds opt-in", () => {
    expect(
      shouldEnableDevTools({ isPackaged: true, platform: "darwin" })
    ).toBe(false);
    expect(
      shouldEnableDevTools({
        isPackaged: true,
        platform: "darwin",
        environmentOverride: "1"
      })
    ).toBe(true);
  });

  it("enables developer tools in development on every platform", () => {
    expect(
      shouldEnableDevTools({ isPackaged: false, platform: "linux" })
    ).toBe(true);
  });
});
