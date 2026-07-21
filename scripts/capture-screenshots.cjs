/**
 * Captures the README screenshots.
 *
 * Loads each renderer view from the Vite dev server into an offscreen
 * BrowserWindow whose preload is a mocked `window.openVideoCraft` bridge
 * (scripts/screenshot-preload.cjs) filled with demo data, waits for the UI to
 * settle, and saves PNGs with `webContents.capturePage()` — no OS
 * screen-recording permission or real projects needed.
 *
 * Usage:
 *   1. Generate demo media into ./demo-assets (see docs in the repo history
 *      or regenerate any short mp4/m4a files with those names).
 *   2. npx vite --host 127.0.0.1              # dev server on :5173
 *   3. npx electron scripts/capture-screenshots.cjs [launcher recorder editor editor-timeline]
 *
 * Output: docs/screenshots/{launcher,recorder,editor}.png
 */
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { version: appVersion } = require("../package.json");

const devServer = "http://127.0.0.1:5173/";
const outDir = path.join(__dirname, "..", "docs", "screenshots");
const availableTargets = new Set(["launcher", "recorder", "editor", "editor-timeline"]);
const requestedTargets = new Set(process.argv.slice(2));

for (const target of requestedTargets) {
  if (!availableTargets.has(target)) {
    throw new Error(`Unknown screenshot target: ${target}`);
  }
}

function shouldCapture(name) {
  return requestedTargets.size === 0 || requestedTargets.has(name);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function capture(name, view, options) {
  const {
    width,
    height,
    query = {},
    settleMs = 3000,
    css = null,
    script = null,
    expectedSelector = null
  } = options;
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    backgroundColor: "#121317",
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, "screenshot-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      additionalArguments: [`--screenshot-app-version=${appVersion}`]
    }
  });

  win.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(`preload failed for ${name} (${preloadPath}):`, error);
  });
  win.webContents.on("console-message", (details) => {
    if (details.level === "error") {
      console.error(`renderer error for ${name}:`, details.message);
    }
  });

  const url = new URL(devServer);
  url.searchParams.set("view", view);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  // A load started immediately after the previous window's teardown can abort
  // with ERR_FAILED; one retry after a short pause is reliable.
  try {
    await win.loadURL(url.toString());
  } catch {
    await delay(750);
    await win.loadURL(url.toString());
  }
  if (css) {
    await win.webContents.insertCSS(css);
  }
  if (script) {
    await win.webContents.executeJavaScript(script).catch((error) => {
      console.warn(`script for ${name} failed:`, error.message);
    });
  }
  await delay(settleMs);
  if (expectedSelector) {
    const rendered = await win.webContents.executeJavaScript(
      `Boolean(document.querySelector(${JSON.stringify(expectedSelector)}))`
    );
    if (!rendered) {
      throw new Error(`${name} did not render its expected UI (${expectedSelector})`);
    }
  }
  // Hidden BrowserWindows can retain an incomplete damage region after a tool
  // switch. Force one complete repaint before capture so every pane is present.
  win.webContents.invalidate();
  await delay(500);

  const image = await win.webContents.capturePage();
  const png = image.toPNG();
  if (png.length < 1000) {
    console.warn(`capture for ${name} looks empty (${png.length} bytes)`);
  }
  fs.writeFileSync(path.join(outDir, `${name}.png`), png);
  console.log(`saved ${name}.png (${Math.round(png.length / 1024)} KB)`);
  win.destroy();
  await delay(500);
}

// Windows are created and destroyed one at a time; without this handler,
// Electron's default quits the app as soon as the first capture window closes.
app.on("window-all-closed", () => undefined);

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  let exitCode = 0;

  try {
    if (shouldCapture("launcher")) {
      await capture("launcher", "main", {
        width: 1360,
        height: 900,
        expectedSelector: "[data-home-project-grid]"
      });
    }

    // The recorder window is transparent chrome; draw a backdrop so the PNG
    // reads well on both GitHub themes.
    if (shouldCapture("recorder")) {
      await capture("recorder", "controller", {
        width: 460,
        height: 560,
        css: "html, body { background: radial-gradient(120% 120% at 20% 0%, #232735 0%, #14161d 60%, #0d0e13 100%) !important; }",
        expectedSelector: "[data-recorder-controller]"
      });
    }

    if (shouldCapture("editor")) {
      await capture("editor", "editor", {
        width: 1720,
        height: 1040,
        query: { projectId: "demo" },
        settleMs: 5000
      });
    }

    // Same project with the Subtitles tool active: shows the timeline lanes
    // (video/audio/subtitles), the subtitle overlay, and the playhead seeked
    // one second in via the ArrowRight shortcut.
    if (shouldCapture("editor-timeline")) {
      await capture("editor-timeline", "editor", {
        width: 1720,
        height: 1040,
        query: { projectId: "demo" },
        settleMs: 6000,
        script: `
          new Promise((resolve) => {
            setTimeout(() => {
              document.querySelector('button[title="Subtitles"]')?.click();
              setTimeout(() => {
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
                resolve(true);
              }, 800);
            }, 2500);
          })
        `
      });
    }
  } catch (error) {
    console.error(error);
    exitCode = 1;
  }

  app.exit(exitCode);
});
