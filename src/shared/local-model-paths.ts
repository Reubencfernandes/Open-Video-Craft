import path from "node:path";

/** Writable locations for local AI models and their download cache. */
export interface LocalModelPaths {
  readonly localModelPath: string;
  readonly cacheDir: string;
}

/**
 * Transformers.js defaults these paths to directories beside its own module.
 * In a packaged Electron app that directory is inside `app.asar`, which is a
 * single file: reads then fail with ENOTDIR. Both locations must live under the
 * app's writable userData directory instead.
 */
export function resolveLocalModelPaths(userDataPath: string): LocalModelPaths {
  const root = path.resolve(userDataPath);
  return {
    localModelPath: path.join(root, "models"),
    cacheDir: path.join(root, "model-cache")
  };
}
