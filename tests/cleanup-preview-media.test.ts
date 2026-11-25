import { describe, expect, it } from "vitest";
import { applyCleanupPreviewUrls } from "../src/renderer/editor/cleanup-preview";
import type { EditorMediaItem } from "../src/renderer/editor/types";

const media: EditorMediaItem[] = [
  { id: "video", name: "clip.mp4", url: "ovc-import://file/video", kind: "video", origin: "imported", track: "imported", duration: 10 },
  { id: "music", name: "music.wav", url: "ovc-import://file/music", kind: "audio", origin: "imported", track: "imported", duration: 10 }
];

describe("applyCleanupPreviewUrls", () => {
  it("replaces only audio media URLs and leaves video media untouched", () => {
    const result = applyCleanupPreviewUrls(media, {
      video: { key: "wind:30", url: "ovc-import://file/cleaned-video" },
      music: { key: "wind:35", url: "ovc-import://file/cleaned-music" }
    });
    expect(result[0]?.url).toBe("ovc-import://file/video");
    expect(result[1]?.url).toBe("ovc-import://file/cleaned-music");
  });
});
