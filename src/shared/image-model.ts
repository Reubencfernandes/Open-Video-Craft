/**
 * Local image generation model (S13, T10).
 *
 * The diffusion pipeline needs a model asset before it can draw anything. Only
 * the asset description lives here: name, where it comes from, how big it is and
 * under which license, so the app can show an honest "not installed yet" state
 * instead of pretending a generator exists.
 *
 * Size is deliberately visible: this model is the single largest download the
 * app can trigger, and the owner decides whether to spend that space.
 */
export interface ImageModelSpec {
  readonly name: string;
  readonly url: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly license: string;
  /** Side files a diffusion pipeline needs besides the main graph. */
  readonly companions: readonly string[];
  /** Identifier the transformers.js text-to-image pipeline loads. */
  readonly pipelineId: string;
}

/** SD-Turbo in ONNX form: one to four steps per image on Apple Silicon. */
export const imageGenerationModel: ImageModelSpec = {
  name: "SD-Turbo (ONNX)",
  url: "https://huggingface.co/schwg/sd-turbo-ONNX/resolve/main/unet/model.onnx",
  fileName: "sd-turbo-unet.onnx",
  sizeBytes: 1_400_000_000,
  license: "Stability AI Community License",
  companions: ["text_encoder/model.onnx", "vae_decoder/model.onnx", "tokenizer/tokenizer.json"],
  pipelineId: "schwg/sd-turbo-ONNX"
};

/** Human-readable size, so the UI never surprises the owner with a download. */
export function formatModelSize(bytes: number): string {
  const gigabytes = bytes / 1_000_000_000;
  return gigabytes >= 1 ? `${gigabytes.toFixed(1)} GB` : `${Math.round(bytes / 1_000_000)} MB`;
}
