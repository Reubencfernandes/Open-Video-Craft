/** Search-filtered project grid plus the compact latest-project row. */
import { AlertTriangle, FolderOpen, RefreshCw, Trash2 } from "lucide-react";
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
    <section className="grid gap-4">
      <div className="flex items-end justify-between gap-4">
        <div><h2 className="m-0 text-xl font-medium text-white">Recent Projects</h2><p className="m-0 mt-1 text-sm text-slate-400">Continue working on your recent projects.</p></div>
        <button className="grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-white/[0.05] hover:text-white disabled:opacity-40" type="button" title="Refresh projects" disabled={props.loading} onClick={props.onRefresh}><RefreshCw className={props.loading ? "animate-spin" : ""} size={16} /></button>
      </div>

      {props.loading ? <ProjectSkeletons /> : props.projects.length === 0 ? (
        <div className="grid min-h-40 place-items-center rounded-xl bg-white/[0.02] text-sm text-slate-500">No saved projects yet.</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,280px))] justify-start gap-3">
          {props.projects.slice(0, 5).map((project, index) => (
            <article className="grid min-w-0 gap-3 rounded-xl bg-white/[0.025] p-3" key={`${project.id}-${project.rootPath}`}>
              <ProjectArtwork name={project.name} index={index} duration={formatProjectDuration(project.durationMs)} thumbnailUrl={project.thumbnailUrl} />
              <div className="flex min-w-0 items-center justify-between gap-2">
                <strong className="truncate text-sm font-medium text-white">{project.name}</strong>
                {!project.available ? <AlertTriangle className="shrink-0 text-amber-300" size={15} /> : null}
              </div>
              <p className="m-0 truncate text-[0.69rem] text-slate-500">{formatProjectUpdatedAt(project.updatedAt)} · {formatMediaAvailability(project)}</p>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-white/[0.05] text-sm text-slate-200 hover:bg-white/[0.09] disabled:opacity-35" type="button" disabled={props.disabled || !project.available} onClick={() => props.onOpen(project)}><FolderOpen size={15} /> Open</button>
                <button className="grid size-10 place-items-center rounded-lg bg-white/[0.035] text-slate-500 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-35" type="button" title="Delete project" disabled={props.disabled} onClick={() => props.onDelete(project.id)}><Trash2 size={14} /></button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectSkeletons() {
  return <div className="grid grid-cols-3 gap-3">{[0, 1, 2].map((item) => <div className="h-64 animate-pulse rounded-xl bg-white/[0.025]" key={item} />)}</div>;
}
