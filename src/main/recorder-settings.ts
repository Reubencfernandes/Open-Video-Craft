/**
 * App-level recorder settings store: reads and writes
 * `<userData>/recorder-settings.json`. Deliberately outside every project so
 * the owner's source and quality selection is reused across recordings.
 */
import { promises as fs } from "node:fs";
import {
  parseRecorderSettings,
  type RecorderSettings
} from "../shared/recorder-settings";
import { writeJsonFileAtomic } from "./project-file";

export class RecorderSettingsStore {
  constructor(private readonly filePath: string) {}

  /** null means a genuine first run: no settings were ever saved. */
  async read(): Promise<RecorderSettings | null> {
    let raw: string;

    try {
      raw = await fs.readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }

    try {
      return parseRecorderSettings(JSON.parse(raw));
    } catch {
      // A corrupt preferences file must not block the recorder; treating it as
      // a first run rebuilds the defaults instead of failing to open.
      return null;
    }
  }

  async write(settings: unknown): Promise<RecorderSettings> {
    const validated = parseRecorderSettings(settings);

    if (!validated) {
      throw new Error("Invalid recorder settings.");
    }

    await writeJsonFileAtomic(this.filePath, validated);
    return validated;
  }
}
