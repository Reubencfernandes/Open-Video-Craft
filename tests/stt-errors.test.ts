import { describe, expect, it } from "vitest";
import { formatSpeechToTextError } from "../src/renderer/editor/stt-errors";

describe("formatSpeechToTextError", () => {
  it("formats an Electron-wrapped Gemini 503 response", () => {
    const message = formatSpeechToTextError(
      new Error(`Error invoking remote method 'stt:transcribe': Error: Gemini transcription failed (HTTP 503). {
        "error": {
          "code": 503,
          "message": "This model is currently experiencing high demand.",
          "status": "UNAVAILABLE"
        }
      }`),
      "gemini"
    );

    expect(message).toBe(
      "Gemini is temporarily unavailable because of high demand. Wait a moment and try again."
    );
    expect(message).not.toMatch(/remote method|stt:transcribe|\{\s*"error"|HTTP 503/);
  });

  it("keeps provider-specific recovery advice", () => {
    expect(formatSpeechToTextError("Cohere rate limit reached.", "cohere")).toBe(
      "Cohere's rate limit has been reached. Wait a moment and try again."
    );
    expect(formatSpeechToTextError("Error: network request failed", "whisper-local")).toBe(
      "Whisper could not be reached. Check your internet connection and try again."
    );
  });
});
