import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";

/** Reject traversal and symlink/junction escapes, including new output paths. */
export function resolveContainedProjectPath(rootPath: string, relativePath: string): string {
  const root = path.resolve(rootPath);
  const target = path.resolve(root, relativePath);
  if (!isWithin(root, target)) throw new Error("Requested project path is outside of the project folder.");
  const realRoot = realpathSync(root);
  let existing = target;
  while (true) {
    try {
      const realTarget = realpathSync(existing);
      if (!isWithin(realRoot, realTarget)) throw new Error("Project path links outside of the project folder.");
      return target;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      // An unresolved symlink is not a safe future write target.
      if (lstatSync(existing, { throwIfNoEntry: false })) throw new Error("Project path contains an unresolved link.");
      if (existing === root) throw error;
      existing = path.dirname(existing);
    }
  }
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}
