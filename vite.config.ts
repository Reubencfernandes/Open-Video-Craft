import { createReadStream, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

// The ONNX Runtime wasm backend that transformers.js needs is normally fetched
// from the jsdelivr CDN at runtime. The packaged renderer loads over file:// and
// its CSP only allows huggingface.co, so that fetch fails with "no available
// backend". Bundle the runtime next to index.html and serve it in dev instead;
// useSubtitleGeneration points env.backends.onnx.wasm.wasmPaths at this origin.
// Transformers.js v4 resolves these files through its onnxruntime-web dependency.
const ortRuntimeDist = path.dirname(
  createRequire(import.meta.url).resolve("onnxruntime-web")
);
const ortRuntimeFiles = ["ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"];

function bundleOrtRuntime(): Plugin {
  return {
    name: "ovc-ort-runtime",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requested = ortRuntimeFiles.find(
          (file) => req.url === `/${file}` || req.url?.startsWith(`/${file}?`)
        );
        if (!requested) {
          next();
          return;
        }

        res.setHeader(
          "Content-Type",
          requested.endsWith(".mjs") ? "text/javascript" : "application/wasm"
        );
        createReadStream(path.join(ortRuntimeDist, requested)).pipe(res);
      });
    },
    generateBundle() {
      for (const file of ortRuntimeFiles) {
        this.emitFile({
          type: "asset",
          fileName: file,
          source: readFileSync(path.join(ortRuntimeDist, file))
        });
      }
    }
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), bundleOrtRuntime()],
  build: {
    outDir: "dist-renderer",
    emptyOutDir: true
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: process.platform === "win32"
      ? ["tests/ffmpeg-release-scripts.test.ts"]
      : []
  }
});
