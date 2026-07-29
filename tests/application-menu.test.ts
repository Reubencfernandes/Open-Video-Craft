import { describe, expect, it, vi } from "vitest";
import { createMacApplicationMenuTemplate } from "../src/main/application-menu";

describe("macOS application menu", () => {
  it("provides a Window menu action that reopens the main window", () => {
    const showMainWindow = vi.fn();
    const template = createMacApplicationMenuTemplate(showMainWindow);
    const windowMenu = template.find((item) => item.label === "Window");
    const submenu = Array.isArray(windowMenu?.submenu) ? windowMenu.submenu : [];
    const reopen = submenu.find((item) => item.label === "Open Main Window");

    expect(reopen?.accelerator).toBe("CmdOrCtrl+0");
    expect(reopen?.click).toBe(showMainWindow);

    if (typeof reopen?.click === "function") {
      reopen.click({} as never, {} as never, {} as never);
    }
    expect(showMainWindow).toHaveBeenCalledOnce();
  });
});
