import { describe, expect, it } from "vitest";
import {
  createNdjsonParser,
  isSupportedPythonVersion,
  venvPythonPath
} from "../src/main/music-generation";
import { buildLyriaPrompt, parseLyriaResponse } from "../src/main/music-lyria";

describe("createNdjsonParser", () => {
  it("parses complete protocol lines and buffers partial ones", () => {
    const parser = createNdjsonParser();
    expect(
      parser.push('{"type":"progress","phase":"generating","percent":10}\n{"type":"res')
    ).toEqual([{ type: "progress", phase: "generating", percent: 10 }]);
    expect(parser.push('ult","path":"/tmp/out.wav"}\n')).toEqual([
      { type: "result", path: "/tmp/out.wav" }
    ]);
  });

  it("ignores non-protocol noise", () => {
    const parser = createNdjsonParser();
    const messages = parser.push(
      'Downloading model weights...\n{"other":"json"}\n{"type":"error","message":"boom"}\nnot json {\n'
    );
    expect(messages).toEqual([{ type: "error", message: "boom" }]);
  });
});

describe("isSupportedPythonVersion", () => {
  it("accepts 3.10–3.12 and rejects everything else", () => {
    expect(isSupportedPythonVersion("3.10")).toBe(true);
    expect(isSupportedPythonVersion("3.11")).toBe(true);
    expect(isSupportedPythonVersion("3.12")).toBe(true);
    expect(isSupportedPythonVersion("3.9")).toBe(false);
    expect(isSupportedPythonVersion("3.13")).toBe(false);
    expect(isSupportedPythonVersion("2.7")).toBe(false);
    expect(isSupportedPythonVersion("garbage")).toBe(false);
  });
});

describe("venvPythonPath", () => {
  it("resolves per-platform interpreter locations", () => {
    expect(venvPythonPath("/data/venv", "darwin")).toBe("/data/venv/bin/python");
    expect(venvPythonPath("C:\\data\\venv", "win32")).toContain("Scripts");
  });
});

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
