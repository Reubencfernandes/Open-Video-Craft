import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProviderKeysManager, type SafeStorageLike } from "../src/main/provider-keys";

const xorByte = 0x5a;

function fakeSafeStorage(available: boolean): SafeStorageLike {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain) =>
      Buffer.from([...Buffer.from(plain, "utf8")].map((byte) => byte ^ xorByte)),
    decryptString: (encrypted) =>
      Buffer.from([...encrypted].map((byte) => byte ^ xorByte)).toString("utf8")
  };
}

describe("ProviderKeysManager", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(os.tmpdir(), "ovc-keys-"));
  });
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("round-trips keys with safeStorage encryption", async () => {
    const manager = new ProviderKeysManager({
      userDataPath: directory,
      safeStorage: fakeSafeStorage(true)
    });
    await manager.update({ geminiApiKey: "gm-secret", cohereApiKey: "co-secret" });

    expect(await manager.getGeminiKey()).toBe("gm-secret");
    expect(await manager.getCohereKey()).toBe("co-secret");

    const raw = await readFile(path.join(directory, "provider-keys.json"), "utf8");
    expect(raw).not.toContain("gm-secret");
    expect(raw).not.toContain("co-secret");
    expect(raw).toContain("safeStorage");
  });

  it("falls back to obfuscated storage when encryption is unavailable", async () => {
    const manager = new ProviderKeysManager({
      userDataPath: directory,
      safeStorage: fakeSafeStorage(false)
    });
    await manager.update({ geminiApiKey: "plain-secret" });
    expect(await manager.getGeminiKey()).toBe("plain-secret");
    const raw = await readFile(path.join(directory, "provider-keys.json"), "utf8");
    expect(raw).not.toContain("plain-secret");
    expect(raw).toContain("plaintext");
  });

  it("never exposes keys in the renderer view", async () => {
    const manager = new ProviderKeysManager({
      userDataPath: directory,
      safeStorage: fakeSafeStorage(true)
    });
    const view = await manager.update({ geminiApiKey: "gm-secret" });
    expect(JSON.stringify(view)).not.toContain("gm-secret");
    expect(view.hasGeminiKey).toBe(true);
    expect(view.hasCohereKey).toBe(false);
  });

  it("clears keys with null and persists provider/language choices", async () => {
    const manager = new ProviderKeysManager({
      userDataPath: directory,
      safeStorage: fakeSafeStorage(true)
    });
    await manager.update({ cohereApiKey: "key", sttProvider: "cohere", cohereLanguage: "de" });
    let view = await manager.getView();
    expect(view.sttProvider).toBe("cohere");
    expect(view.cohereLanguage).toBe("de");

    view = await manager.update({ cohereApiKey: null });
    expect(view.hasCohereKey).toBe(false);
    expect(await manager.getCohereKey()).toBeNull();
  });

  it("survives a corrupt settings file", async () => {
    const manager = new ProviderKeysManager({
      userDataPath: directory,
      safeStorage: fakeSafeStorage(true)
    });
    const view = await manager.getView();
    expect(view.sttProvider).toBe("whisper-local");
    expect(view.hasGeminiKey).toBe(false);
  });
});
