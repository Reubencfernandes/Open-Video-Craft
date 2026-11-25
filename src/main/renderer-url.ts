/**
 * Decides which base URL the renderer windows load. Kept free of any
 * `electron` import so it can be unit tested.
 *
 * A dev-server URL coming from the environment is only honored when the app
 * is not packaged: a packaged build must never load an environment-provided
 * (and therefore attacker-controllable) URL.
 */
export interface RendererUrlInput {
  isPackaged: boolean;
  devServerUrl: string | undefined;
  fileUrl: string;
}

export function resolveRendererBaseUrl({ isPackaged, devServerUrl, fileUrl }: RendererUrlInput): string {
  if (!isPackaged && devServerUrl) {
    return devServerUrl;
  }

  return fileUrl;
}
