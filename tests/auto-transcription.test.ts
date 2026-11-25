import { describe, expect, it } from "vitest";

import {
  consumeAutoAnalyzeRequest,
  shouldStartAutoTranscription
} from "../src/renderer/editor/auto-transcription";

const baseGate = {
  requested: true,
  editorReady: true,
  speechSourceCount: 2,
  subtitleCount: 0,
  alreadyStarted: false
};

describe("automatic transcription after recording", () => {
  it("starts once for a freshly recorded project with speech and no subtitles", () => {
    expect(shouldStartAutoTranscription(baseGate)).toBe(true);
  });

  it("never overwrites subtitles that already exist", () => {
    expect(shouldStartAutoTranscription({ ...baseGate, subtitleCount: 12 })).toBe(false);
  });

  it("waits for the persisted editor state before transcribing", () => {
    expect(shouldStartAutoTranscription({ ...baseGate, editorReady: false })).toBe(false);
  });

  it("does nothing when the editor was not opened by a finished recording", () => {
    expect(shouldStartAutoTranscription({ ...baseGate, requested: false })).toBe(false);
  });

  it("runs at most once per editor session", () => {
    expect(shouldStartAutoTranscription({ ...baseGate, alreadyStarted: true })).toBe(false);
  });

  it("skips a project with no audible speech source", () => {
    expect(shouldStartAutoTranscription({ ...baseGate, speechSourceCount: 0 })).toBe(false);
  });
});

describe("one-shot auto-analyze request", () => {
  it("consumes the flag while keeping the project id", () => {
    expect(consumeAutoAnalyzeRequest("?view=editor&projectId=abc&autoAnalyze=1")).toEqual({
      requested: true,
      search: "?view=editor&projectId=abc"
    });
  });

  it("leaves a normal editor URL untouched", () => {
    expect(consumeAutoAnalyzeRequest("?view=editor&projectId=abc")).toEqual({
      requested: false,
      search: "?view=editor&projectId=abc"
    });
  });

  it("returns an empty search when the flag was the only parameter", () => {
    expect(consumeAutoAnalyzeRequest("?autoAnalyze=1")).toEqual({
      requested: true,
      search: ""
    });
  });
});
