import { describe, expect, it, vi } from "vitest";
import { settleEditorSessionAfterSave } from "../src/renderer/editor/useEditorPersistence";

describe("editor persistence flush state", () => {
  it("stays dirty when a newer snapshot was queued during a save", () => {
    const notifySession = vi.fn();

    const dirty = settleEditorSessionAfterSave({
      latestSignature: "newer-snapshot",
      savedSignature: "older-snapshot",
      notifySession
    });

    expect(dirty).toBe(true);
    expect(notifySession).toHaveBeenCalledWith(true);
  });

  it("becomes clean only when the saved snapshot is still current", () => {
    const notifySession = vi.fn();

    const dirty = settleEditorSessionAfterSave({
      latestSignature: "current-snapshot",
      savedSignature: "current-snapshot",
      notifySession
    });

    expect(dirty).toBe(false);
    expect(notifySession).toHaveBeenCalledWith(false);
  });
});
