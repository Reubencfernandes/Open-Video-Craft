import { describe, expect, it } from "vitest";
import {
  assertClaudeChatRequest,
  assertGeminiChatSendRequest,
  assertMusicGenerateRequest,
  assertProviderKeyId,
  assertSttTranscribeRequest,
  assertUpdateProviderKeysRequest
} from "../src/main/request-validation";

const uuid = "123e4567-e89b-42d3-a456-426614174000";

describe("assertClaudeChatRequest", () => {
  it("accepts a bounded project id and message", () => {
    expect(() => assertClaudeChatRequest({ projectId: "project-1", message: "Add zooms" })).not.toThrow();
  });

  it("rejects missing, empty or oversized input", () => {
    expect(() => assertClaudeChatRequest(null)).toThrow("Invalid Claude chat request");
    expect(() => assertClaudeChatRequest({ projectId: "", message: "x" })).toThrow();
    expect(() => assertClaudeChatRequest({ projectId: "p", message: " " })).toThrow();
    expect(() => assertClaudeChatRequest({ projectId: "p", message: "x".repeat(8_001) })).toThrow();
  });
});

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
    engine: "lyria-clip",
    prompt: "lofi beat",
    lyrics: ""
  };

  it("accepts Lyria engines without local ACE-Step fields", () => {
    for (const engine of ["lyria-clip", "lyria-pro"]) {
      expect(() => assertMusicGenerateRequest({ ...valid, engine })).not.toThrow();
    }
  });

  it("rejects the removed ACE-Step engine", () => {
    const legacyAceStepRequest = {
      ...valid,
      engine: "acestep",
      durationSeconds: 30,
      inferSteps: 27,
      guidanceScale: 15,
      seed: null
    };
    expect(() => assertMusicGenerateRequest(legacyAceStepRequest)).toThrow(
      "Invalid music generation request."
    );
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
