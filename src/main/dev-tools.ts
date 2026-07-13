/** Decide whether a window should expose Chromium developer tools. */
export function shouldEnableDevTools(input: {
  isPackaged: boolean;
  platform: NodeJS.Platform;
  environmentOverride?: string;
}): boolean {
  return (
    !input.isPackaged ||
    input.platform === "win32" ||
    input.environmentOverride === "1"
  );
}
