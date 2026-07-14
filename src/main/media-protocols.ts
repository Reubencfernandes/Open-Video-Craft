/**
 * Custom `ovc-media://` (project files) and `ovc-import://` (imported files)
 * protocols. Adds CORS headers so renderer fetch()/canvas reads work, and
 * forwards Range headers so media elements can seek.
 */
import { protocol } from "electron";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { parseByteRange } from "./media-range";
import type { ProjectStore } from "./project-store";

interface MediaProtocolDependencies {
  projectStore: ProjectStore;
  importedMediaCache: Map<string, string>;
}

export function registerMediaProtocol({
  projectStore,
  importedMediaCache
}: MediaProtocolDependencies): void {
  protocol.handle("ovc-media", async (request) => {
    try {
      const url = new URL(request.url);
      const pathSegments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      const [projectId, ...relativePathSegments] = pathSegments;

      if (url.hostname !== "project" || !projectId || relativePathSegments.length === 0) {
        return new Response("Not found", { status: 404 });
      }

      const filePath = projectStore.resolveProjectFile(
        projectId,
        relativePathSegments.join(path.sep)
      );

      return await createLocalMediaResponse(filePath, request);
    } catch (error) {
      return new Response(error instanceof Error ? error.message : "Not found", {
        status: 404
      });
    }
  });

  protocol.handle("ovc-import", async (request) => {
    try {
      const url = new URL(request.url);
      const id = url.pathname.split("/").filter(Boolean).map(decodeURIComponent)[0];
      const filePath = id ? importedMediaCache.get(id) : null;

      if (url.hostname !== "file" || !filePath) {
        return new Response("Not found", { status: 404 });
      }

      return await createLocalMediaResponse(filePath, request);
    } catch (error) {
      return new Response(error instanceof Error ? error.message : "Not found", {
        status: 404
      });
    }
  });
}

/**
 * Serve local media with explicit 206 responses. `net.fetch(file://...)` can
 * ignore Range headers on some Electron/macOS combinations, leaving WebM
 * seeks permanently stuck at zero and causing secondary tracks to restart.
 */
async function createLocalMediaResponse(filePath: string, request: Request): Promise<Response> {
  const stats = await fs.stat(filePath);
  if (!stats.isFile()) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-cache",
    "Content-Type": getMediaContentType(filePath)
  });
  if (request.method === "OPTIONS") {
    headers.set("Access-Control-Allow-Headers", "Range, Content-Type");
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    return new Response(null, { status: 204, headers });
  }

  const range = parseByteRange(request.headers.get("range"), stats.size);
  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${stats.size}`);
    return new Response(null, { status: 416, headers });
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? Math.max(0, stats.size - 1);
  headers.set("Content-Length", String(Math.max(0, end - start + 1)));
  if (range) {
    headers.set("Content-Range", `bytes ${start}-${end}/${stats.size}`);
  }

  const body =
    request.method === "HEAD" || stats.size === 0
      ? null
      : (Readable.toWeb(createReadStream(filePath, { start, end })) as unknown as BodyInit);
  return new Response(body, { status: range ? 206 : 200, headers });
}

function getMediaContentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".webm": return "video/webm";
    case ".mp4": return "video/mp4";
    case ".mov": return "video/quicktime";
    case ".wav": return "audio/wav";
    case ".mp3": return "audio/mpeg";
    case ".m4a": return "audio/mp4";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    default: return "application/octet-stream";
  }
}
