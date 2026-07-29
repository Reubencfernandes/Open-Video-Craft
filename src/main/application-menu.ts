import type { MenuItemConstructorOptions } from "electron";

/**
 * A real Window menu is required on macOS so a closed single main window can
 * be recreated without relaunching the application from Finder or the Dock.
 */
export function createMacApplicationMenuTemplate(
  showMainWindow: () => void
): MenuItemConstructorOptions[] {
  return [
    { role: "appMenu" },
    { role: "editMenu" },
    {
      label: "Window",
      submenu: [
        {
          label: "Open Main Window",
          accelerator: "CmdOrCtrl+0",
          click: showMainWindow
        },
        { type: "separator" },
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" }
      ]
    }
  ];
}
