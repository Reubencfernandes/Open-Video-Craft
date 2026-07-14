/** Safety checks performed immediately before moving a project to the Trash. */
import path from "node:path";
import { readProjectFile } from "./project-file";

export async function assertProjectDeletionTarget(
  rootPath: string,
  expectedProjectId: string
): Promise<void> {
  const resolvedRoot = path.resolve(rootPath);
  if (resolvedRoot === path.parse(resolvedRoot).root) {
    throw new Error("Refusing to delete a filesystem root.");
  }

  let project;
  try {
    project = await readProjectFile(resolvedRoot);
  } catch {
    throw new Error(
      "This folder is not a valid Open Video Craft project, so it was not deleted. Remove it from Recents instead."
    );
  }

  if (project.id !== expectedProjectId) {
    throw new Error(
      "The project folder does not match the selected library entry, so it was not deleted."
    );
  }
}
