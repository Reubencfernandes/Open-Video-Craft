import { describe, expect, it } from "vitest";
import { assertStartRecordingRequest } from "../src/main/request-validation";

const legacyRequest = {
  projectId: "project-1",
  source: { id: "screen:0:0", name: "Display 1", kind: "screen", displayId: "1" },
  devices: {
    microphone: { enabled: true, deviceId: "mic-1", label: "Microphone" },
    camera: { enabled: true, deviceId: "camera-1", label: "Face" }
  },
  tracks: {
    screen: { enabled: true, mimeType: "video/webm" },
    camera: { enabled: true, mimeType: "video/webm" },
    mic: { enabled: true, mimeType: "audio/webm" },
    system: { enabled: true, mimeType: "audio/webm" }
  }
};

const multiSourceRequest = {
  ...legacyRequest,
  sources: [
    { id: "screen:0:0", name: "Display 1", kind: "screen", displayId: "1" },
    { id: "screen:1:0", name: "Display 2", kind: "screen", displayId: "2" }
  ],
  captures: [
    { trackId: "screen", kind: "screen", sourceId: "screen:0:0", label: "Display 1", mimeType: "video/webm" },
    { trackId: "screen-2", kind: "screen", sourceId: "screen:1:0", label: "Display 2", mimeType: "video/webm" },
    { trackId: "camera", kind: "camera", sourceId: "camera-1", label: "Face", mimeType: "video/webm" },
    { trackId: "camera-2", kind: "camera", sourceId: "camera-2", label: "Desk", mimeType: "video/webm" },
    { trackId: "micWebm", kind: "mic", sourceId: "mic-1", label: "Microphone", mimeType: "audio/webm" },
    { trackId: "systemWebm", kind: "system", sourceId: null, label: "System audio", mimeType: "audio/webm" }
  ]
};

function expectInvalid(value: unknown): void {
  expect(() => assertStartRecordingRequest(value)).toThrow(/Invalid recording start request/);
}

describe("assertStartRecordingRequest", () => {
  it("still accepts the legacy single-source payload", () => {
    expect(() => assertStartRecordingRequest(legacyRequest)).not.toThrow();
  });

  it("accepts a multi-source capture plan", () => {
    expect(() => assertStartRecordingRequest(multiSourceRequest)).not.toThrow();
  });

  it("rejects duplicate capture track ids", () => {
    expectInvalid({
      ...multiSourceRequest,
      captures: [
        multiSourceRequest.captures[0],
        { ...multiSourceRequest.captures[1], trackId: "screen" }
      ]
    });
  });

  it("rejects capture track ids that do not match their recording kind", () => {
    expectInvalid({
      ...multiSourceRequest,
      captures: [{ ...multiSourceRequest.captures[1], kind: "camera" }]
    });
  });

  it("rejects unknown or malformed capture track ids", () => {
    expectInvalid({
      ...multiSourceRequest,
      captures: [{ ...multiSourceRequest.captures[0], trackId: "../screen" }]
    });
    expectInvalid({
      ...multiSourceRequest,
      captures: [{ ...multiSourceRequest.captures[0], trackId: "screen-1" }]
    });
  });

  it("rejects captures without a label or mime type", () => {
    expectInvalid({
      ...multiSourceRequest,
      captures: [{ ...multiSourceRequest.captures[0], label: "" }]
    });
    expectInvalid({
      ...multiSourceRequest,
      captures: [{ ...multiSourceRequest.captures[0], mimeType: "" }]
    });
  });

  it("rejects an invalid captured source list", () => {
    expectInvalid({
      ...multiSourceRequest,
      sources: [{ id: "screen:0:0", name: "Display 1", kind: "printer", displayId: "1" }]
    });
  });
});
