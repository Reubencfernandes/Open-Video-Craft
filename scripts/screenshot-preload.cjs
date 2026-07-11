/**
 * Mock `window.openVideoCraft` bridge used only by scripts/capture-screenshots.cjs.
 *
 * It mirrors the real preload API surface (src/preload/preload.ts) but answers
 * every call with static demo data, so each renderer view can be loaded and
 * screenshotted for the README without touching real projects, permissions,
 * or recordings.
 */
const { contextBridge } = require("electron");

const now = new Date();
const iso = (minutesAgo) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();

const demoAssetBase = "http://127.0.0.1:5173/demo-assets";

const appInfo = { version: "1.2.1", isPackaged: true, platform: "darwin" };

const updateStatus = {
  state: "not-available",
  currentVersion: "1.2.1",
  latestVersion: "1.2.1",
  message: "You're up to date.",
  checkedAt: iso(4),
  downloadProgress: null,
  isPackaged: true
};

const permissionStatus = {
  platform: "darwin",
  canDragAppBundle: false,
  screen: "granted",
  camera: "granted",
  microphone: "granted"
};

const sourceThumbnail = (() => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#1e3a8a"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs>' +
    '<rect width="480" height="270" fill="url(#g)"/></svg>';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
})();

const recentProjects = [
  {
    id: "demo",
    name: "Product Demo",
    rootPath: "~/Videos/OpenVideoCraft/product-demo",
    status: "complete",
    durationMs: 20_000,
    updatedAt: iso(12),
    mediaAvailability: { screen: true, camera: true, audio: true },
    thumbnailUrl: `${demoAssetBase}/product-demo.mp4`,
    available: true
  },
  {
    id: "onboarding",
    name: "Onboarding Walkthrough",
    rootPath: "~/Videos/OpenVideoCraft/onboarding-walkthrough",
    status: "complete",
    durationMs: 154_000,
    updatedAt: iso(60 * 26),
    mediaAvailability: { screen: true, camera: false, audio: true },
    thumbnailUrl: `${demoAssetBase}/intro.mp4`,
    available: true
  },
  {
    id: "bug-repro",
    name: "Bug Repro for #42",
    rootPath: "~/Videos/OpenVideoCraft/bug-repro-42",
    status: "complete",
    durationMs: 47_000,
    updatedAt: iso(60 * 49),
    mediaAvailability: { screen: true, camera: false, audio: false },
    thumbnailUrl: `${demoAssetBase}/product-demo.mp4`,
    available: true
  }
];

const demoProject = {
  schemaVersion: 1,
  appVersion: "1.1.1",
  id: "demo",
  name: "Product Demo",
  createdAt: iso(90),
  updatedAt: iso(12),
  status: "complete",
  source: { id: "screen:0:0", name: "Built-in Display", kind: "screen", displayId: "1" },
  devices: {
    microphone: { enabled: true, deviceId: "mic", label: "MacBook Pro Microphone" },
    camera: { enabled: false, deviceId: null, label: null }
  },
  tracks: {},
  durationMs: 20_000,
  startedAt: iso(90),
  stoppedAt: iso(88),
  error: null,
  rootPath: "~/Videos/OpenVideoCraft/product-demo",
  mediaUrls: {}
};

const demoImports = [
  {
    id: "imp-clip",
    name: "product-demo.mp4",
    kind: "video",
    extension: "mp4",
    duration: 12,
    url: `${demoAssetBase}/product-demo.mp4`
  },
  {
    id: "imp-intro",
    name: "intro.mp4",
    kind: "video",
    extension: "mp4",
    duration: 8,
    url: `${demoAssetBase}/intro.mp4`
  },
  {
    id: "imp-music",
    name: "music.m4a",
    kind: "audio",
    extension: "m4a",
    duration: 30,
    url: `${demoAssetBase}/music.m4a`
  }
];

const demoEditorState = {
  savedAt: iso(12),
  imports: demoImports,
  state: {
    v: 2,
    timelineSegments: [
      { id: "imp-clip:segment-1", itemId: "imp-clip", track: "video", lane: 0, start: 0, end: 12, sourceStart: 0 },
      { id: "imp-intro:segment-1", itemId: "imp-intro", track: "video", lane: 0, start: 12, end: 20, sourceStart: 0 },
      { id: "imp-music:segment-bg", itemId: "imp-music", track: "audio", lane: 0, start: 0, end: 20, sourceStart: 0 }
    ],
    zoomEffects: [
      { id: "zoom-1", start: 3, end: 6.5, speed: "medium", scale: 1.6, targetX: 55, targetY: 40 }
    ],
    speedEffects: [{ id: "speed-1", start: 14, end: 17, rate: 2 }],
    subtitles: [
      { id: "sub-1", start: 0.4, end: 2.6, text: "Welcome to Open Video Craft" },
      { id: "sub-2", start: 2.8, end: 5.4, text: "Record your screen, camera and audio" },
      { id: "sub-3", start: 5.6, end: 8.8, text: "Then polish everything on the timeline" }
    ],
    subtitleLanguage: "english",
    subtitleStyle: "karaoke",
    layoutMode: "bubble",
    backgroundStyle: "gradient-3",
    activeBackgroundCategory: "gradient",
    cameraSize: 24,
    cameraPosition: "bottom-right",
    cameraShape: "circle",
    cameraBorderStyle: "light",
    cameraContentTransform: { x: 0, y: 0, scale: 100, mirrored: false },
    videoCornerStyle: "soft",
    screenPosition: { x: 0, y: 0, scale: 100 },
    screenAspectRatio: "16:9",
    cameraFrame: { x: 64, y: 56, size: 24 },
    masterVolume: 100,
    audioLevels: {},
    backgroundAudioIds: ["imp-music"],
    customBackgroundImportId: null,
    trimRange: { start: 0, end: 20 }
  }
};

const api = {
  app: {
    getInfo: async () => appInfo,
    openExternal: async () => true
  },
  updates: {
    getStatus: async () => updateStatus,
    check: async () => updateStatus,
    install: async () => true,
    onStatus: () => () => undefined
  },
  sources: {
    list: async () => [
      {
        id: "screen:0:0",
        name: "Built-in Display",
        kind: "screen",
        displayId: "1",
        thumbnail: sourceThumbnail,
        appIcon: null
      }
    ]
  },
  permissions: {
    getStatus: async () => permissionStatus,
    openSettings: async () => true,
    showGuide: async () => true,
    requestMedia: async () => true,
    revealApp: async () => true,
    startAppDrag: () => undefined
  },
  capture: {
    selectDisplaySource: async () => true
  },
  projects: {
    chooseBaseDirectory: async () => null,
    listRecent: async () => recentProjects,
    get: async () => demoProject,
    openExistingProjectFolder: async () => null,
    removeFromRecent: async () => true,
    discard: async () => true,
    create: async () => demoProject
  },
  recording: {
    start: async () => demoProject,
    writeChunk: async () => demoProject,
    stop: async () => demoProject,
    fail: async () => demoProject
  },
  ffmpeg: {
    prepareAudio: async () => demoProject
  },
  windows: {
    openRecorderController: async () => true,
    minimizeCurrent: async () => true,
    closeCurrent: async () => true,
    hideCurrent: async () => true,
    showCurrent: async () => true,
    setRecorderCompact: async () => true,
    openEditor: async () => true,
    openMain: async () => true
  },
  editor: {
    importMedia: async () => [],
    removeImportedMedia: async () => true,
    loadProjectState: async () => demoEditorState,
    saveProjectState: async () => demoEditorState,
    exportVideo: async () => null
  },
  overlays: {
    showSourceBorder: async () => ({ shown: true, reason: null }),
    hideSourceBorder: async () => true
  },
  events: {
    onGlobalStop: () => () => undefined
  }
};

contextBridge.exposeInMainWorld("openVideoCraft", api);
