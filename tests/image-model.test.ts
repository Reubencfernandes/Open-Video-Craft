import { describe, expect, it } from "vitest";

import { formatModelSize, imageGenerationModel } from "../src/shared/image-model";

describe("local image model asset", () => {
  it("states its size and license before anything is downloaded", () => {
    expect(formatModelSize(imageGenerationModel.sizeBytes)).toBe("1.4 GB");
    expect(imageGenerationModel.license.length).toBeGreaterThan(5);
    expect(imageGenerationModel.url.startsWith("https://")).toBe(true);
  });

  it("lists the side files the pipeline needs", () => {
    expect(imageGenerationModel.companions).toContain("text_encoder/model.onnx");
    expect(imageGenerationModel.companions).toContain("vae_decoder/model.onnx");
  });

  it("formats small assets in megabytes", () => {
    expect(formatModelSize(176_000_000)).toBe("176 MB");
  });
});
