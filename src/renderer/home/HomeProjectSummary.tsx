import { Clock3, FileVideo2, FolderOpen, Layers3 } from "lucide-react";
import type { ProjectLibraryEntry } from "../../shared/types";
import { ProjectArtwork } from "./ProjectArtwork";
import {
  formatMediaAvailability,
  formatProjectDuration,
  formatProjectUpdatedAt
} from "./project-formatters";

/** Real recent-project information and library readiness for the dashboard side panel. */
export function HomeProjectSummary(props: {
  projects: ProjectLibraryEntry[];
  disabled: boolean;
  onOpen: (project: ProjectLibraryEntry) => void;
  onNewProject: () => void;
}) {
  const featured = props.projects[0] ?? null;
  const availableCount = props.projects.filter((project) => project.available).length;
  const readiness = props.projects.length
    ? Math.round((availableCount / props.projects.length) * 100)
    : 0;
  const totalDuration = props.projects.reduce(
    (total, project) => total + Math.max(0, project.durationMs ?? 0),
    0
  );

  return (
    <aside className="grid content-start gap-4 rounded-2xl bg-[#151517] p-4 shadow-[0_18px_50px_rgb(0_0_0_/_0.18)]" data-home-project-summary>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <FileVideo2 className="text-neutral-500" size={16} />
          Project information
        </div>
        <span className="text-[0.62rem] font-semibold text-neutral-600">Latest</span>
      </div>

      {featured ? (
        <div className="grid gap-3">
          <ProjectArtwork
            name={featured.name}
            index={0}
            duration={formatProjectDuration(featured.durationMs)}
            thumbnailUrl={featured.thumbnailUrl}
          />
          <div className="min-w-0">
            <strong className="block truncate text-sm font-semibold text-white">{featured.name}</strong>
            <span className="mt-1 block text-[0.66rem] text-neutral-600">
              {formatProjectUpdatedAt(featured.updatedAt)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/[0.035] p-3">
              <Clock3 className="text-neutral-600" size={14} />
              <span className="mt-2 block text-[0.62rem] text-neutral-600">Duration</span>
              <strong className="mt-0.5 block text-xs font-semibold text-neutral-300">{formatProjectDuration(featured.durationMs)}</strong>
            </div>
            <div className="rounded-xl bg-white/[0.035] p-3">
              <Layers3 className="text-neutral-600" size={14} />
              <span className="mt-2 block text-[0.62rem] text-neutral-600">Media</span>
              <strong className="mt-0.5 block truncate text-xs font-semibold text-neutral-300">{formatMediaAvailability(featured)}</strong>
            </div>
          </div>
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white text-xs font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-40"
            type="button"
            disabled={props.disabled || !featured.available}
            onClick={() => props.onOpen(featured)}
          >
            <FolderOpen size={14} /> Open project
          </button>
        </div>
      ) : (
        <div className="grid min-h-40 place-items-center rounded-2xl bg-white/[0.025] p-5 text-center">
          <div>
            <FileVideo2 className="mx-auto text-neutral-700" size={25} />
            <p className="m-0 mt-3 text-xs leading-5 text-neutral-500">Your latest project will appear here.</p>
            <button className="mt-3 text-xs font-semibold text-[#ff6ba5] hover:text-[#ff8fbb]" type="button" onClick={props.onNewProject}>Create a project</button>
          </div>
        </div>
      )}

      <div className="grid gap-3 rounded-2xl bg-white/[0.025] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <strong className="block text-xs font-semibold text-neutral-300">Library readiness</strong>
            <span className="mt-1 block text-[0.62rem] text-neutral-600">Projects available on this computer</span>
          </div>
          <div
            className="grid size-16 shrink-0 place-items-center rounded-full"
            style={{
              background: `conic-gradient(#ff4b93 ${readiness}%, rgb(255 255 255 / 0.055) ${readiness}% 100%)`
            }}
          >
            <span className="grid size-12 place-items-center rounded-full bg-[#18181b] text-xs font-bold text-white">{readiness}%</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[0.64rem]">
          <span className="rounded-lg bg-black/15 px-2.5 py-2 text-neutral-500"><strong className="mr-1 text-neutral-300">{props.projects.length}</strong> projects</span>
          <span className="rounded-lg bg-black/15 px-2.5 py-2 text-neutral-500"><strong className="mr-1 text-neutral-300">{formatProjectDuration(totalDuration)}</strong> total</span>
        </div>
      </div>
    </aside>
  );
}
