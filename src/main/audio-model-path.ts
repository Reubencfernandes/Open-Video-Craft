import path from "node:path";

/** Locates the bundled RNNoise model in packaged apps and in development. */
export function resolveArnndnModelPath(
  resourcesPath?: string,
  moduleDirectory: string = __dirname
): string {
  return resourcesPath
    ? path.join(resourcesPath, "models", "lq.rnnn")
    : path.resolve(moduleDirectory, "..", "..", "resources", "models", "lq.rnnn");
}
