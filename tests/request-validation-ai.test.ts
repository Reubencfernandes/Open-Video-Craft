import { describe, expect, it } from "vitest";
import {
  assertGeminiChatSendRequest,
  assertMusicGenerateRequest,
  assertProviderKeyId,
  assertSttTranscribeRequest,
  assertUpdateProviderKeysRequest
} from "../src/main/request-validation";

const uuid = "123e4567-e89b-42d3-a456-426614174000";

describe("assertUpdateProviderKeysRequest", () => {
  it("accepts partial updates and null key clears", () => {
    expect(() => assertUpdateProviderKeysRequest({})).not.toThrow();
    expect(() =>
      assertUpdateProviderKeysRequest({ sttProvider: "cohere", cohereApiKey: "abc", cohereLanguage: "de" })
    ).not.toThrow();
    expect(() => assertUpdateProviderKeysRequest({ geminiApiKey: null })).not.toThrow();
  });

  it("rejects bad providers, oversized keys, bad languages", () => {
    expect(() => assertUpdateProviderKeysRequest({ sttProvider: "openai" })).toThrow();
    expect(() => assertUpdateProviderKeysRequest({ cohereApiKey: "x".repeat(600) })).toThrow();
    expect(() => assertUpdateProviderKeysRequest({ cohereLanguage: "german" })).toThrow();
    expect(() => assertUpdateProviderKeysRequest(null)).toThrow();
  });
});

describe("assertProviderKeyId", () => {
  it("accepts supported cloud credentials and rejects everything else", () => {
    expect(() => assertProviderKeyId("gemini")).not.toThrow();
    expect(() => assertProviderKeyId("cohere")).not.toThrow();
    expect(() => assertProviderKeyId("openai")).toThrow();
    expect(() => assertProviderKeyId(null)).toThrow();
  });
});

describe("assertSttTranscribeRequest", () => {
  const source = {
    url: "ovc-import://file/abc",
    sourceStart: 0,
    duration: 12,
    timelineOffset: 0,
    gain: 1
  };

  it("accepts a valid request", () => {
    expect(() =>
      assertSttTranscribeRequest({ requestId: uuid, provider: "gemini", sources: [source] })
    ).not.toThrow();
  });

  it("rejects raw file paths and http URLs", () => {
    for (const url of ["/etc/passwd", "file:///etc/passwd", "https://example.com/a.mp3"]) {
      expect(() =>
        assertSttTranscribeRequest({ requestId: uuid, provider: "cohere", sources: [{ ...source, url }] })
      ).toThrow();
    }
  });

  it("rejects whisper-local, empty sources, and bad ids", () => {
    expect(() =>
      assertSttTranscribeRequest({ requestId: uuid, provider: "whisper-local", sources: [source] })
    ).toThrow();
    expect(() =>
      assertSttTranscribeRequest({ requestId: uuid, provider: "cohere", sources: [] })
    ).toThrow();
    expect(() =>
      assertSttTranscribeRequest({ requestId: "nope", provider: "cohere", sources: [source] })
    ).toThrow();
  });
});

describe("assertMusicGenerateRequest", () => {
  const valid = {
    jobId: uuid,
    engine: "acestep",
    prompt: "lofi beat",
    lyrics: "",
    durationSeconds: 30,
    inferSteps: 27,
    guidanceScale: 15,
    seed: null
  };

  it("accepts a valid request for all engines", () => {
    for (const engine of ["acestep", "lyria-clip", "lyria-pro"]) {
      expect(() => assertMusicGenerateRequest({ ...valid, engine })).not.toThrow();
    }
  });

  it("rejects out-of-range fields", () => {
    expect(() => assertMusicGenerateRequest({ ...valid, engine: "suno" })).toThrow();
    expect(() => assertMusicGenerateRequest({ ...valid, prompt: "" })).toThrow();
    expect(() => assertMusicGenerateRequest({ ...valid, durationSeconds: 2 })).toThrow();
    expect(() => assertMusicGenerateRequest({ ...valid, durationSeconds: 999 })).toThrow();
    expect(() => assertMusicGenerateRequest({ ...valid, inferSteps: 5 })).toThrow();
    expect(() => assertMusicGenerateRequest({ ...valid, guidanceScale: 0 })).toThrow();
    expect(() => assertMusicGenerateRequest({ ...valid, seed: -1 })).toThrow();
    expect(() => assertMusicGenerateRequest({ ...valid, jobId: "nope" })).toThrow();
  });
});

describe("assertGeminiChatSendRequest", () => {
  it("accepts a valid chat message", () => {
    expect(() =>
      assertGeminiChatSendRequest({ projectId: "p1", message: "add zooms", includeVideo: false })
    ).not.toThrow();
  });

  it("rejects empty and oversized messages", () => {
    expect(() =>
      assertGeminiChatSendRequest({ projectId: "p1", message: "  ", includeVideo: false })
    ).toThrow();
    expect(() =>
      assertGeminiChatSendRequest({ projectId: "p1", message: "x".repeat(9000), includeVideo: false })
    ).toThrow();
    expect(() =>
      assertGeminiChatSendRequest({ projectId: "p1", message: "hi", includeVideo: "yes" })
    ).toThrow();
  });
});
