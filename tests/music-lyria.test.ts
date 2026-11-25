import { describe, expect, it } from "vitest";
import { buildLyriaPrompt, parseLyriaResponse } from "../src/main/music-lyria";

describe("parseLyriaResponse", () => {
  it("extracts audio and joins lyric text blocks", () => {
    const audio = Buffer.from("fake-mp3-bytes");
    const result = parseLyriaResponse({
      steps: [
        { type: "thinking", content: [{ type: "text", text: "planning" }] },
        {
          type: "model_output",
          content: [
            { type: "text", text: "[Verse]\nHello" },
            { type: "audio", data: audio.toString("base64"), mime_type: "audio/mpeg" },
            { type: "text", text: "[Chorus]\nWorld" }
          ]
        }
      ]
    });
    expect(result.audio.equals(audio)).toBe(true);
    expect(result.mimeType).toBe("audio/mpeg");
    expect(result.lyrics).toBe("[Verse]\nHello\n\n[Chorus]\nWorld");
  });

  it("throws a safety-aware error when no audio is present", () => {
    expect(() => parseLyriaResponse({ steps: [] })).toThrowError(/no audio/i);
    expect(() =>
      parseLyriaResponse({ steps: [], error: { message: "Blocked by safety filters" } })
    ).toThrowError(/safety/i);
  });
});

describe("buildLyriaPrompt", () => {
  it("appends lyrics only when provided", () => {
    expect(buildLyriaPrompt("dreamy pop", "")).toBe("dreamy pop");
    expect(buildLyriaPrompt("dreamy pop", "[Verse]\nla la")).toContain("Use the following lyrics");
  });
});
