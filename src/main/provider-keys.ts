/**
 * Stores user-supplied cloud provider API keys (Cohere, Gemini) plus the
 * speech-to-text provider preference in userData/provider-keys.json. Keys are
 * encrypted with Electron safeStorage when the OS keychain is available and
 * are never handed to the renderer — views only expose hasXKey booleans.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  ProviderKeysView,
  SttProviderId,
  UpdateProviderKeysRequest
} from "../shared/types";
import { writeJsonFileAtomic } from "./project-file";

export const cohereTranscribeModel = "cohere-transcribe-03-2026";

/** Languages supported by Cohere Transcribe (ISO 639-1). */
export const cohereTranscribeLanguages = [
  { code: "en", label: "English" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "it", label: "Italian" },
  { code: "es", label: "Spanish" },
  { code: "pt", label: "Portuguese" },
  { code: "el", label: "Greek" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "vi", label: "Vietnamese" },
  { code: "zh", label: "Chinese" },
  { code: "ar", label: "Arabic" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" }
] as const;

export const cohereLanguageCodes: string[] = cohereTranscribeLanguages.map(
  (entry) => entry.code
);

type KeyEncryption = "safeStorage" | "plaintext";

interface StoredKey {
  apiKey: string;
  keyEncryption: KeyEncryption;
}

interface ProviderKeysFile {
  schemaVersion: 1;
  sttProvider: SttProviderId;
  cohere: (StoredKey & { language: string }) | null;
  gemini: StoredKey | null;
  updatedAt: string;
}

/** Minimal surface of Electron's safeStorage, injectable for tests. */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

const sttProviders: SttProviderId[] = ["whisper-local", "cohere", "gemini"];

export class ProviderKeysManager {
  constructor(
    private readonly input: {
      userDataPath: string;
      safeStorage: SafeStorageLike;
    }
  ) {}

  async getView(): Promise<ProviderKeysView> {
    const file = await this.readFile();
    return {
      sttProvider: file.sttProvider,
      hasCohereKey: Boolean(file.cohere?.apiKey),
      hasGeminiKey: Boolean(file.gemini?.apiKey),
      cohereLanguage: file.cohere?.language ?? "en",
      encryptionAvailable: this.encryptionAvailable()
    };
  }

  async update(request: UpdateProviderKeysRequest): Promise<ProviderKeysView> {
    const file = await this.readFile();

    if (request.sttProvider && sttProviders.includes(request.sttProvider)) {
      file.sttProvider = request.sttProvider;
    }

    if (request.cohereApiKey === null) {
      file.cohere = null;
    } else if (typeof request.cohereApiKey === "string" && request.cohereApiKey.trim()) {
      file.cohere = {
        ...this.encryptKey(request.cohereApiKey.trim()),
        language: file.cohere?.language ?? "en"
      };
    }

    if (request.cohereLanguage && cohereLanguageCodes.includes(request.cohereLanguage)) {
      if (file.cohere) {
        file.cohere.language = request.cohereLanguage;
      }
    }

    if (request.geminiApiKey === null) {
      file.gemini = null;
    } else if (typeof request.geminiApiKey === "string" && request.geminiApiKey.trim()) {
      file.gemini = this.encryptKey(request.geminiApiKey.trim());
    }

    file.updatedAt = new Date().toISOString();
    await writeJsonFileAtomic(this.settingsPath(), file);
    return this.getView();
  }

  async getCohereKey(): Promise<string | null> {
    const file = await this.readFile();
    return file.cohere ? this.decryptKey(file.cohere) : null;
  }

  async getCohereLanguage(): Promise<string> {
    const file = await this.readFile();
    return file.cohere?.language ?? "en";
  }

  async getGeminiKey(): Promise<string | null> {
    const file = await this.readFile();
    return file.gemini ? this.decryptKey(file.gemini) : null;
  }

  private encryptionAvailable(): boolean {
    try {
      return this.input.safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  private encryptKey(apiKey: string): StoredKey {
    if (this.encryptionAvailable()) {
      return {
        apiKey: this.input.safeStorage.encryptString(apiKey).toString("base64"),
        keyEncryption: "safeStorage"
      };
    }
    return {
      apiKey: Buffer.from(apiKey, "utf8").toString("base64"),
      keyEncryption: "plaintext"
    };
  }

  private decryptKey(stored: StoredKey): string | null {
    try {
      const raw = Buffer.from(stored.apiKey, "base64");
      return stored.keyEncryption === "safeStorage"
        ? this.input.safeStorage.decryptString(raw)
        : raw.toString("utf8");
    } catch {
      return null;
    }
  }

  private async readFile(): Promise<ProviderKeysFile> {
    try {
      const parsed = JSON.parse(
        await fs.readFile(this.settingsPath(), "utf8")
      ) as Partial<ProviderKeysFile>;
      return {
        schemaVersion: 1,
        sttProvider: sttProviders.includes(parsed.sttProvider as SttProviderId)
          ? (parsed.sttProvider as SttProviderId)
          : "whisper-local",
        cohere: isStoredKey(parsed.cohere)
          ? {
              apiKey: parsed.cohere.apiKey,
              keyEncryption: parsed.cohere.keyEncryption,
              language: cohereLanguageCodes.includes(
                (parsed.cohere as { language?: string }).language ?? ""
              )
                ? ((parsed.cohere as { language?: string }).language as string)
                : "en"
            }
          : null,
        gemini: isStoredKey(parsed.gemini) ? { apiKey: parsed.gemini.apiKey, keyEncryption: parsed.gemini.keyEncryption } : null,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString()
      };
    } catch {
      return {
        schemaVersion: 1,
        sttProvider: "whisper-local",
        cohere: null,
        gemini: null,
        updatedAt: new Date().toISOString()
      };
    }
  }

  private settingsPath(): string {
    return path.join(this.input.userDataPath, "provider-keys.json");
  }
}

function isStoredKey(value: unknown): value is StoredKey {
  const key = value as Partial<StoredKey> | null;
  return (
    Boolean(key) &&
    typeof key === "object" &&
    typeof key?.apiKey === "string" &&
    key.apiKey.length > 0 &&
    (key.keyEncryption === "safeStorage" || key.keyEncryption === "plaintext")
  );
}
