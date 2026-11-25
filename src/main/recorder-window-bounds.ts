/**
 * App-level persisted bounds for the expanded recorder window. Kept outside
 * project state so the last manual size/position survives every recording.
 */
import { promises as fs } from "node:fs";
import { writeJsonFileAtomic } from "./project-file";
import { getExpandedRecorderWindowSize } from "./recorder-window-size";

export interface RecorderWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WorkAreaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const minimumSize = 460;

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

export function parseRecorderWindowBounds(value: unknown): RecorderWindowBounds | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    !isInteger(candidate.x) || !isInteger(candidate.y) ||
    !isInteger(candidate.width) || !isInteger(candidate.height)
  ) return null;
  if (
    candidate.x < 0 || candidate.y < 0 ||
    candidate.width < minimumSize || candidate.height < minimumSize ||
    candidate.width > 4096 || candidate.height > 4096
  ) return null;
  return {
    x: candidate.x,
    y: candidate.y,
    width: candidate.width,
    height: candidate.height
  };
}

export function clampRecorderWindowBounds(
  bounds: RecorderWindowBounds,
  workArea: WorkAreaRect
): RecorderWindowBounds {
  const width = Math.min(bounds.width, Math.max(minimumSize, workArea.width - 48));
  const height = Math.min(bounds.height, Math.max(minimumSize, workArea.height - 48));
  return {
    width,
    height,
    x: Math.min(
      Math.max(bounds.x, workArea.x),
      workArea.x + Math.max(0, workArea.width - width)
    ),
    y: Math.min(
      Math.max(bounds.y, workArea.y),
      workArea.y + Math.max(0, workArea.height - height)
    )
  };
}

export function resolveRecorderWindowBounds(
  saved: RecorderWindowBounds | null,
  workArea: WorkAreaRect
): RecorderWindowBounds {
  if (saved) return clampRecorderWindowBounds(saved, workArea);
  const size = getExpandedRecorderWindowSize(workArea);
  return {
    width: size.width,
    height: size.height,
    x: Math.round(workArea.x + (workArea.width - size.width) / 2),
    y: Math.round(workArea.y + (workArea.height - size.height) / 2)
  };
}

export class RecorderWindowBoundsStore {
  constructor(private readonly filePath: string) {}

  async read(): Promise<RecorderWindowBounds | null> {
    try {
      return parseRecorderWindowBounds(JSON.parse(await fs.readFile(this.filePath, "utf8")));
    } catch {
      return null;
    }
  }

  async write(bounds: RecorderWindowBounds): Promise<RecorderWindowBounds> {
    const validated = parseRecorderWindowBounds(bounds);
    if (!validated) throw new Error("Invalid recorder window bounds.");
    await writeJsonFileAtomic(this.filePath, validated);
    return validated;
  }
}
