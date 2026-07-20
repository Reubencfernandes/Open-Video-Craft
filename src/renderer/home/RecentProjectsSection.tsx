/** Search-filtered project grid plus the compact latest-project row. */
import { AlertTriangle, FolderOpen, Grid2X2, RefreshCw, Trash2 } from "lucide-react";
import type { ProjectLibraryEntry } from "../../shared/types";
import { ProjectArtwork } from "./ProjectArtwork";
import { formatMediaAvailability, formatProjectDuration, formatProjectUpdatedAt } from "./project-formatters";

export function RecentProjectsSection(props: {
  projects: ProjectLibraryEntry[];
  loading: boolean;
  disabled: boolean;
  onRefresh: () => void;
  onOpen: (project: ProjectLibraryEntry) => void;
  onDelete: (projectId: string) => void;
}) {
  return (
    <section className="grid gap-3" data-home-project-grid>
      <div className="flex items-end justify-between gap-4">
        <div><h2 className="m-0 text-base font-semibold text-white">Recent projects</h2><p className="m-0 mt-1 text-xs text-neutral-500">Continue where you left off.</p></div>
        <div className="flex items-center gap-1 rounded-xl bg-white/[0.035] p-1">
          <span className="grid size-8 place-items-center rounded-lg bg-white/[0.07] text-neutral-300" title="Grid view"><Grid2X2 size={14} /></span>
          <button className="grid size-8 place-items-center rounded-lg text-neutral-500 transition hover:bg-white/[0.055] hover:text-white disabled:opacity-40" type="button" title="Refresh projects" disabled={props.loading} onClick={props.onRefresh}><RefreshCw className={props.loading ? "animate-spin" : ""} size={14} /></button>
        </div>
      </div>

      {props.loading ? <ProjectSkeletons /> : props.projects.length === 0 ? (
        <div className="grid min-h-40 place-items-center rounded-2xl bg-white/[0.025] text-sm text-neutral-600">No saved projects yet.</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,190px),1fr))] gap-3">
          {props.projects.slice(0, 9).map((project, index) => (
            <article className="group grid min-w-0 gap-2.5 rounded-2xl bg-[#19191c] p-2.5 shadow-[0_8px_22px_rgb(0_0_0_/_0.12)] transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-[#1e1e22]" key={`${project.id}-${project.rootPath}`}>
              <ProjectArtwork name={project.name} index={index} duration={formatProjectDuration(project.durationMs)} thumbnailUrl={project.thumbnailUrl} />
              <div className="flex min-w-0 items-center justify-between gap-2 px-1">
                <strong className="truncate text-sm font-medium text-white">{project.name}</strong>
                {!project.available ? <AlertTriangle className="shrink-0 text-amber-300" size={15} /> : null}
              </div>
              <p className="m-0 truncate px-1 text-[0.64rem] text-neutral-600">{formatProjectUpdatedAt(project.updatedAt)} · {formatMediaAvailability(project)}</p>
              <div className="grid grid-cols-[1fr_auto] gap-1.5">
                <button className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-white/[0.055] text-xs font-semibold text-neutral-300 transition hover:bg-white/[0.1] hover:text-white disabled:opacity-35" type="button" disabled={props.disabled || !project.available} onClick={() => props.onOpen(project)}><FolderOpen size={14} /> Open</button>
                <button className="grid size-9 place-items-center rounded-xl bg-white/[0.035] text-neutral-600 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-35" type="button" title="Delete project" disabled={props.disabled} onClick={() => props.onDelete(project.id)}><Trash2 size={13} /></button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectSkeletons() {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <div className="h-56 animate-pulse rounded-2xl bg-white/[0.025]" key={item} />)}</div>;
}
