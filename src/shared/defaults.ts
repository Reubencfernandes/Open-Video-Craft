/**
 * Factory functions for the default JSON files written into a new project
 * folder (project.json, edits.json, subtitles.json).
 */
import type {
  DefaultEditsFile,
  ProjectDevices,
  ProjectFile,
  SubtitlesFile
} from "./types";

export const defaultDevices: ProjectDevices = {
  microphone: {
    enabled: false,
    deviceId: null,
    label: null
  },
  camera: {
    enabled: false,
    deviceId: null,
    label: null
  }
};

export function createDefaultProjectFile(input: {
  appVersion: string;
  id: string;
  name: string;
  now: string;
}): ProjectFile {
  return {
    schemaVersion: 1,
    appVersion: input.appVersion,
    id: input.id,
    name: input.name,
    createdAt: input.now,
    updatedAt: input.now,
    status: "created",
    source: null,
    devices: defaultDevices,
    tracks: {},
    durationMs: null,
    startedAt: null,
    stoppedAt: null,
    error: null
  };
}

export function createDefaultEdits(): DefaultEditsFile {
  return {
    schemaVersion: 1,
    aspectRatio: "16:9",
    background: {
      type: "gradient",
      preset: "blue-red"
    },
    screen: {
      x: 120,
      y: 60,
      width: 1080,
      height: 620,
      borderRadius: 18,
      shadow: true
    },
    camera: {
      enabled: true,
      shape: "circle",
      x: 960,
      y: 520,
      size: 180,
      border: true,
      shadow: true
    },
    subtitles: {
      enabled: false,
      font: "Inter",
      fontSize: 42,
      position: "bottom",
      highlightWords: true
    },
    zoomEffects: []
  };
}

export function createDefaultSubtitles(): SubtitlesFile {
  return {
    schemaVersion: 1,
    language: null,
    generatedAt: null,
    segments: []
  };
}
