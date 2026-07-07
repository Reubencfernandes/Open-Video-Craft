import { net, protocol } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
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

      // Keep Range headers intact; HTML media seeking depends on partial reads.
      return net.fetch(pathToFileURL(filePath).toString(), { headers: request.headers });
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

      return net.fetch(pathToFileURL(filePath).toString(), { headers: request.headers });
    } catch (error) {
      return new Response(error instanceof Error ? error.message : "Not found", {
        status: 404
      });
    }
  });
}
