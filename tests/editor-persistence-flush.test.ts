import { describe, expect, it, vi } from "vitest";
import { settleEditorSessionAfterSave, trackSaveInFlight } from "../src/renderer/editor/useEditorPersistence";

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
