import { afterEach, describe, expect, it, vi } from "vitest";

const dependencyMocks = vi.hoisted(() => ({
  applyAgentEdit: vi.fn(async () => ({
    editId: "edit-applied-once",
    document: { revision: 2 },
    edit: { duration: 0.25, warnings: [], affectedClipIds: ["clip-1"] }
  })),
  hasFreshDirtySession: vi.fn(async () => false),
  readEditorDocument: vi.fn(async () => null),
  undoAgentEdit: vi.fn(async () => ({ revision: 3 })),
  resolveCatalogProject: vi.fn(async () => ({
    rootPath: "/test/project",
    project: {
      id: "test-project",
      name: "Test project",
      status: "ready",
      tracks: {}
    }
  }))
}));

vi.mock("../src/main/editor-document-store", () => ({
  applyAgentEdit: dependencyMocks.applyAgentEdit,
  hasFreshDirtySession: dependencyMocks.hasFreshDirtySession,
  readEditorDocument: dependencyMocks.readEditorDocument,
  undoAgentEdit: dependencyMocks.undoAgentEdit
}));

vi.mock("../src/mcp/project-catalog", () => ({
  resolveCatalogProject: dependencyMocks.resolveCatalogProject
}));

import { GeminiAgentManager } from "../src/main/gemini-agent";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

interface RequestContent {
  role: string;
  parts: Array<{
    text?: string;
    functionCall?: { id?: string; name: string };
    functionResponse?: { id?: string; name: string };
  }>;
}

function successfulGeminiResponse(parts: Array<Record<string, unknown>>): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { role: "model", parts } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function expectValidFunctionResponsePairs(contents: RequestContent[]): void {
  expect(contents[0]?.role).toBe("user");
  expect(contents[0]?.parts.some((part) => part.text)).toBe(true);
  expect(contents[0]?.parts.some((part) => part.functionResponse)).toBe(false);

  for (let index = 0; index < contents.length; index += 1) {
    const responses = contents[index].parts.flatMap((part) =>
      part.functionResponse ? [part.functionResponse] : []
    );
    if (responses.length === 0) continue;

    const precedingContent = contents[index - 1];
    expect(precedingContent?.role).toBe("model");
    const calls = precedingContent.parts.flatMap((part) =>
      part.functionCall ? [part.functionCall] : []
    );
    for (const response of responses) {
      expect(
        calls.some((call) => call.id === response.id && call.name === response.name)
      ).toBe(true);
    }
  }
}

describe("GeminiAgentManager function calling", () => {
  it("returns a friendly message when Gemini is temporarily overloaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({
        error: {
          code: 503,
          message: "This model is currently experiencing high demand.",
          status: "UNAVAILABLE"
        }
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    )));
    const manager = new GeminiAgentManager({
      userDataPath: "/unused",
      getApiKey: async () => "test-api-key",
      onUpdate: () => undefined,
      requestEditorFlush: () => undefined
    });

    await expect(manager.send({
      projectId: "test-project",
      message: "Add transitions",
      includeVideo: false
    })).rejects.toThrow(
      "Gemini is temporarily unavailable. This is usually caused by high demand; wait a moment and try again."
    );
  });

  it("passes expanded editor operations through the shared Gemini contract", async () => {
    let requestCount = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return successfulGeminiResponse([{
          functionCall: {
            id: "expanded-edit",
            name: "apply_edit_plan",
            args: {
              summary: "Update composition and queue music",
              baseRevision: 1,
              operations: [
                { type: "set_layout", layoutMode: "side-by-side" },
                { type: "set_editor_view", previewQuality: "low", timelineZoom: 2 },
                { type: "generate_music", engine: "lyria-pro", prompt: "Ambient bed" }
              ]
            }
          }
        }]);
      }
      return successfulGeminiResponse([{ text: "Composition updated." }]);
    }));

    const manager = new GeminiAgentManager({
      userDataPath: "/unused",
      getApiKey: async () => "test-api-key",
      onUpdate: () => undefined,
      requestEditorFlush: () => undefined
    });
    await manager.send({
      projectId: "test-project",
      message: "Use side by side and generate an ambient track",
      includeVideo: false
    });

    expect(dependencyMocks.applyAgentEdit).toHaveBeenCalledWith(expect.objectContaining({
      baseRevision: 1,
      operations: [
        { type: "set_layout", layoutMode: "side-by-side" },
        { type: "set_editor_view", previewQuality: "low", timelineZoom: 2 },
        { type: "generate_music", engine: "lyria-pro", prompt: "Ambient bed" }
      ]
    }));
  });

  it("replays thought signatures and echoes function call ids", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);

      if (requestBodies.length === 1) {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  role: "model",
                  parts: [
                    {
                      thoughtSignature: "opaque-thought-signature",
                      functionCall: {
                        id: "tool-call-123",
                        name: "unknown_test_tool",
                        args: { value: 42 }
                      }
                    }
                  ]
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          candidates: [
            { content: { role: "model", parts: [{ text: "Finished." }] } }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const manager = new GeminiAgentManager({
      userDataPath: "/unused",
      getApiKey: async () => "test-api-key",
      onUpdate: () => undefined,
      requestEditorFlush: () => undefined
    });

    const messages = await manager.send({
      projectId: "test-project",
      message: "Use a tool",
      includeVideo: false
    });

    expect(messages.at(-1)?.text).toBe("Finished.");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const secondContents = requestBodies[1]?.contents as Array<{
      role: string;
      parts: Array<Record<string, unknown>>;
    }>;
    expect(secondContents[1]).toEqual({
      role: "model",
      parts: [
        {
          thoughtSignature: "opaque-thought-signature",
          functionCall: {
            id: "tool-call-123",
            name: "unknown_test_tool",
            args: { value: 42 }
          }
        }
      ]
    });
    expect(secondContents[2]).toEqual({
      role: "user",
      parts: [
        {
          functionResponse: {
            id: "tool-call-123",
            name: "unknown_test_tool",
            response: { error: 'Unknown tool "unknown_test_tool".' }
          }
        }
      ]
    });
  });

  it("does not resend an earlier video attachment when consent is off", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(
          JSON.stringify({
            candidates: [
              { content: { role: "model", parts: [{ text: "Acknowledged." }] } }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    const manager = new GeminiAgentManager({
      userDataPath: "/unused",
      getApiKey: async () => "test-api-key",
      onUpdate: () => undefined,
      requestEditorFlush: () => undefined
    });
    await manager.send({
      projectId: "test-project",
      message: "Remember this conversation",
      includeVideo: false
    });

    // Simulate the attachment retained from an earlier consented request without
    // touching the filesystem or exercising the separate Files API upload flow.
    const sessions = Reflect.get(manager, "sessions") as Map<
      string,
      { history: Array<{ role: string; parts: Array<Record<string, unknown>> }> }
    >;
    sessions.get("test-project")?.history[0]?.parts.unshift({
      fileData: { fileUri: "https://files.example/video", mimeType: "video/webm" }
    });

    await manager.send({
      projectId: "test-project",
      message: "Continue without my video",
      includeVideo: false
    });

    const secondContents = requestBodies[1]?.contents as Array<{
      role: string;
      parts: Array<Record<string, unknown>>;
    }>;
    expect(JSON.stringify(secondContents)).not.toContain("fileData");
    expect(secondContents[0]).toEqual({
      role: "user",
      parts: [{ text: "Remember this conversation" }]
    });
    expect(secondContents.at(-1)).toEqual({
      role: "user",
      parts: [{ text: "Continue without my video" }]
    });
  });

  it("bounds long history only at complete top-level user turns", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return successfulGeminiResponse([{ text: "Current request complete." }]);
      })
    );

    const manager = new GeminiAgentManager({
      userDataPath: "/unused",
      getApiKey: async () => "test-api-key",
      onUpdate: () => undefined,
      requestEditorFlush: () => undefined
    });
    const longHistory = Array.from({ length: 12 }, (_, index) => [
      { role: "user", parts: [{ text: `Top-level request ${index}` }] },
      {
        role: "model",
        parts: [
          {
            thoughtSignature: `signature-${index}`,
            functionCall: {
              id: `call-${index}`,
              name: "unknown_test_tool",
              args: { index }
            }
          }
        ]
      },
      {
        role: "user",
        parts: [
          {
            functionResponse: {
              id: `call-${index}`,
              name: "unknown_test_tool",
              response: { ok: true }
            }
          }
        ]
      },
      { role: "model", parts: [{ text: `Top-level response ${index}` }] }
    ]).flat();
    expect(longHistory.length).toBeGreaterThan(40);

    const sessions = Reflect.get(manager, "sessions") as Map<string, unknown>;
    sessions.set("long-history", {
      history: longHistory,
      messages: [],
      videoFile: null,
      abort: null,
      lastEdit: null,
      lastMutation: null
    });

    await manager.send({
      projectId: "long-history",
      message: "Handle the current request",
      includeVideo: false
    });

    const outboundContents = requestBodies[0]?.contents as RequestContent[];
    expect(outboundContents.length).toBeLessThanOrEqual(40);
    expect(outboundContents.at(-1)).toEqual({
      role: "user",
      parts: [{ text: "Handle the current request" }]
    });
    expectValidFunctionResponsePairs(outboundContents);

    const storedSession = sessions.get("long-history") as { history: RequestContent[] };
    expect(storedSession.history.length).toBeLessThanOrEqual(40);
    expectValidFunctionResponsePairs(storedSession.history);
  });

  it("rolls back a failed user turn before retrying", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    let requestCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        requestCount += 1;
        requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        if (requestCount === 1) throw new Error("connection dropped");
        return successfulGeminiResponse([{ text: "Retry complete." }]);
      })
    );

    const manager = new GeminiAgentManager({
      userDataPath: "/unused",
      getApiKey: async () => "test-api-key",
      onUpdate: () => undefined,
      requestEditorFlush: () => undefined
    });

    await expect(
      manager.send({
        projectId: "failed-turn",
        message: "This request fails",
        includeVideo: false
      })
    ).rejects.toThrow("connection dropped");

    await manager.send({
      projectId: "failed-turn",
      message: "Retry cleanly",
      includeVideo: false
    });

    expect(requestBodies[1]?.contents).toEqual([
      { role: "user", parts: [{ text: "Retry cleanly" }] }
    ]);
  });

  it("preserves an applied tool outcome when cancellation interrupts the reply", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    let requestCount = 0;
    let markSecondRequestStarted: (() => void) | undefined;
    const secondRequestStarted = new Promise<void>((resolve) => {
      markSecondRequestStarted = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        requestCount += 1;
        requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        if (requestCount === 1) {
          return successfulGeminiResponse([
            {
              thoughtSignature: "apply-signature",
              functionCall: {
                id: "apply-call-1",
                name: "apply_edit_plan",
                args: {
                  summary: "Set the export range",
                  baseRevision: 1,
                  operations: [{ type: "set_export_range", start: 0, end: 10 }]
                }
              }
            }
          ]);
        }
        if (requestCount === 2) {
          markSecondRequestStarted?.();
          return await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const error = new Error("The operation was aborted");
              error.name = "AbortError";
              reject(error);
            }, { once: true });
          });
        }
        return successfulGeminiResponse([{ text: "Retry acknowledged the applied edit." }]);
      })
    );

    const manager = new GeminiAgentManager({
      userDataPath: "/unused",
      getApiKey: async () => "test-api-key",
      onUpdate: () => undefined,
      requestEditorFlush: () => undefined
    });
    const interruptedSend = manager.send({
      projectId: "cancelled-after-edit",
      message: "Set an export range",
      includeVideo: false
    });

    await secondRequestStarted;
    expect(manager.cancel("cancelled-after-edit")).toBe(true);
    await expect(interruptedSend).rejects.toMatchObject({ name: "AbortError" });

    await manager.send({
      projectId: "cancelled-after-edit",
      message: "Continue after the interruption",
      includeVideo: false
    });

    expect(dependencyMocks.applyAgentEdit).toHaveBeenCalledTimes(1);
    const retryContents = requestBodies[2]?.contents as RequestContent[];
    expectValidFunctionResponsePairs(retryContents);
    expect(retryContents).toContainEqual({
      role: "model",
      parts: [{ text: "The requested edit was applied successfully: Set the export range" }]
    });
    expect(retryContents.at(-1)).toEqual({
      role: "user",
      parts: [{ text: "Continue after the interruption" }]
    });
  });

  it("preserves an undo outcome when cancellation interrupts the reply", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    let requestCount = 0;
    let markSecondRequestStarted: (() => void) | undefined;
    const secondRequestStarted = new Promise<void>((resolve) => {
      markSecondRequestStarted = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        requestCount += 1;
        requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        if (requestCount === 1) {
          return successfulGeminiResponse([
            {
              thoughtSignature: "undo-signature",
              functionCall: { id: "undo-call-1", name: "undo_last_edit", args: {} }
            }
          ]);
        }
        if (requestCount === 2) {
          markSecondRequestStarted?.();
          return await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const error = new Error("The operation was aborted");
              error.name = "AbortError";
              reject(error);
            }, { once: true });
          });
        }
        return successfulGeminiResponse([{ text: "Retry acknowledged the undo." }]);
      })
    );

    const manager = new GeminiAgentManager({
      userDataPath: "/unused",
      getApiKey: async () => "test-api-key",
      onUpdate: () => undefined,
      requestEditorFlush: () => undefined
    });
    const sessions = Reflect.get(manager, "sessions") as Map<string, unknown>;
    sessions.set("cancelled-after-undo", {
      history: [
        { role: "user", parts: [{ text: "Apply the previous edit" }] },
        { role: "model", parts: [{ text: "The previous edit was applied." }] }
      ],
      messages: [],
      videoFile: null,
      abort: null,
      lastEdit: { editId: "previous-edit", revision: 2, summary: "Previous edit" },
      lastMutation: {
        sequence: 1,
        recoveryText: "The requested edit was applied successfully: Previous edit"
      }
    });

    const interruptedSend = manager.send({
      projectId: "cancelled-after-undo",
      message: "Undo that edit",
      includeVideo: false
    });
    await secondRequestStarted;
    expect(manager.cancel("cancelled-after-undo")).toBe(true);
    await expect(interruptedSend).rejects.toMatchObject({ name: "AbortError" });

    await manager.send({
      projectId: "cancelled-after-undo",
      message: "Continue after undo",
      includeVideo: false
    });

    expect(dependencyMocks.undoAgentEdit).toHaveBeenCalledTimes(1);
    const retryContents = requestBodies[2]?.contents as RequestContent[];
    expectValidFunctionResponsePairs(retryContents);
    expect(retryContents).toContainEqual({
      role: "model",
      parts: [{ text: "The previous edit was undone successfully: Previous edit" }]
    });
    expect(retryContents.at(-1)).toEqual({
      role: "user",
      parts: [{ text: "Continue after undo" }]
    });
  });
});
