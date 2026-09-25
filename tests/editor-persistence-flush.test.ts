import { describe, expect, it, vi } from "vitest";
import { mergeSavedEditorImports, settleEditorSessionAfterSave, trackSaveInFlight } from "../src/renderer/editor/useEditorPersistence";
import { createDefaultEditorState } from "../src/shared/editor-domain";
import type { EditorMediaItem } from "../src/renderer/editor/types";

describe("editor persistence flush state", () => {
  it("preserves media additions, deletions, and metadata edits made during a save", () => {
    const item: EditorMediaItem = { id: "a", name: "A", kind: "video", origin: "imported", track: "imported", duration: 3, url: "old.mp4" };
    const removed = { ...item, id: "removed" };
    const changed = { ...item, id: "changed" };
    const newItem = { ...item, id: "new" };
    const updated = { ...changed, duration: 6 };
    const merged = mergeSavedEditorImports([item, updated, newItem], [item, removed, changed], {
      revision: 1, savedAt: "now", state: createDefaultEditorState(),
      lastMutation: { source: "editor", at: "now", editId: null, summary: null },
      imports: [item, removed, changed].map((entry) => ({ id: entry.id, name: entry.name, kind: "video", extension: "mp4", duration: 3, url: "saved.mp4" }))
    });
    expect(merged.map((entry) => entry.id)).toEqual(["a", "changed", "new"]);
    expect(merged[0].url).toBe("saved.mp4");
    expect(merged[1]).toBe(updated);
    expect(merged[2]).toBe(newItem);
  });

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

describe("editor persistence in-flight guard", () => {
  it("releases a save that never awaited", async () => {
    const ref: { current: Promise<void> | null } = { current: null };

    // A silent autosave with no project yet returns before its first `await`,
    // so its whole body — `finally` included — runs synchronously.
    await trackSaveInFlight(ref, (async () => undefined)());

    // A stale promise parked here makes every later save short-circuit, which
    // is what left the Save button doing nothing.
    expect(ref.current).toBeNull();
  });

  it("releases a save that awaited before settling", async () => {
    const ref: { current: Promise<void> | null } = { current: null };

    const operation = trackSaveInFlight(ref, (async () => {
      await Promise.resolve();
    })());
    expect(ref.current).toBe(operation);

    await operation;
    await Promise.resolve();

    expect(ref.current).toBeNull();
  });

  it("releases a save that failed", async () => {
    const ref: { current: Promise<void> | null } = { current: null };

    await trackSaveInFlight(
      ref,
      (async () => {
        try {
          throw new Error("save failed");
        } catch {
          // saveState reports the error and resolves; the guard must still clear.
        }
      })()
    );

    expect(ref.current).toBeNull();
  });

  it("keeps the newest save when an older one settles late", async () => {
    const ref: { current: Promise<void> | null } = { current: null };

    let finishNewer = () => undefined as void;
    const pending = new Promise<void>((resolve) => {
      finishNewer = resolve;
    });

    const older = trackSaveInFlight(ref, (async () => undefined)());
    const newer = trackSaveInFlight(ref, pending);

    await older;
    await Promise.resolve();

    expect(ref.current).toBe(newer);

    finishNewer();
    await newer;
    await Promise.resolve();

    expect(ref.current).toBeNull();
  });
});
