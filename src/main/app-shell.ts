/**
 * App identity: app id/name, dock and about-panel configuration, and the
 * platform icon path.
 */
import { app, nativeImage } from "electron";
import path from "node:path";
import { getProductVersion } from "./app-version";

// App identity stays separate from window creation so packaging/icon changes do
// not expand the main-process bootstrap file.
export const appId = "com.openvideocraft.app";

export function getAppIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app.png")
    : path.join(__dirname, "../../src/renderer/assets/app.png");
}

export function configureAppIdentity(): void {
  app.setName("Open Video Craft");
  app.setAppUserModelId(appId);

  if (process.platform !== "darwin" || !app.dock) {
    return;
  }

  const icon = nativeImage.createFromPath(getAppIconPath());
  if (icon.isEmpty()) {
    return;
  }

  app.dock.setIcon(icon);
  app.setAboutPanelOptions({
    applicationName: "Open Video Craft",
    applicationVersion: getProductVersion(),
    iconPath: getAppIconPath()
  });
}
