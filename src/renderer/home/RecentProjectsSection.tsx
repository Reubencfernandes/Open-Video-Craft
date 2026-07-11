/** Search-filtered project grid plus the compact latest-project row. */
import { AlertTriangle, FolderOpen, MoreVertical, RefreshCw, Trash2 } from "lucide-react";
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
        <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-white/[0.09] text-sm text-slate-500">No saved projects yet.</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(185px,1fr))] gap-3">
          {props.projects.slice(0, 5).map((project, index) => (
            <article className="grid min-w-0 gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3" key={`${project.id}-${project.rootPath}`}>
              <ProjectArtwork name={project.name} index={index} duration={formatProjectDuration(project.durationMs)} />
              <div className="flex min-w-0 items-center justify-between gap-2">
                <strong className="truncate text-sm font-medium text-white">{project.name}</strong>
                {!project.available ? <AlertTriangle className="text-amber-300" size={15} /> : <MoreVertical className="text-slate-500" size={15} />}
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

      {props.projects.length > 0 ? <CompactProjectRow project={props.projects[0]} disabled={props.disabled} onOpen={props.onOpen} onDelete={props.onDelete} /> : null}
    </section>
  );
}

function ProjectSkeletons() {
  return <div className="grid grid-cols-3 gap-3">{[0, 1, 2].map((item) => <div className="h-64 animate-pulse rounded-xl border border-white/[0.05] bg-white/[0.025]" key={item} />)}</div>;
}

function CompactProjectRow(props: { project: ProjectLibraryEntry; disabled: boolean; onOpen: (project: ProjectLibraryEntry) => void; onDelete: (id: string) => void }) {
  return (
    <div className="mt-4 grid gap-3"><div><h2 className="m-0 text-xl font-medium text-white">Project Library</h2><p className="m-0 mt-1 text-sm text-slate-400">Your latest saved project.</p></div>
      <article className="grid grid-cols-[8.5rem_minmax(0,1fr)_auto_auto] items-center gap-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
        <ProjectArtwork name={props.project.name} index={3} duration={formatProjectDuration(props.project.durationMs)} />
        <div className="min-w-0"><strong className="block truncate text-sm font-medium text-white">{props.project.name}</strong><span className="mt-1 block truncate text-xs text-slate-500">{formatProjectUpdatedAt(props.project.updatedAt)} · {formatMediaAvailability(props.project)}</span></div>
        <button className="min-h-10 rounded-lg bg-white/[0.05] px-6 text-sm text-slate-200 hover:bg-white/[0.09] disabled:opacity-35" type="button" disabled={props.disabled || !props.project.available} onClick={() => props.onOpen(props.project)}>Open</button>
        <button className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-red-500/10 hover:text-red-300" type="button" title="Delete project" onClick={() => props.onDelete(props.project.id)}><Trash2 size={14} /></button>
      </article>
    </div>
  );
}
