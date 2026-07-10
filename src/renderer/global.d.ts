/**
 * Ambient declaration of `window.openVideoCraft` (the preload bridge).
 */
import type { OpenVideoCraftApi } from "../preload/preload";

declare global {
  interface Window {
    openVideoCraft: OpenVideoCraftApi;
  }
}

export {};
