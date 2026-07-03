import { AlertTriangle, Film, FolderOpen, ScreenShare, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ProjectLibraryEntry } from "../shared/types";
import appLogo from "./assets/app.png";
import { cx } from "./classNames";

type LaunchAction = "record" | "edit" | "open-existing" | "remove-recent";

export function App() {
  const [busyAction, setBusyAction] = useState<LaunchAction | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<ProjectLibraryEntry[]>([]);
  const [recentProjectsLoading, setRecentProjectsLoading] = useState(true);

  useEffect(() => {
    void loadRecentProjects();
  }, []);

  async function openRecorder() {
    await runLaunchAction("record", () =>
      window.openVideoCraft.windows.openRecorderController()
    );
  }

  async function openEditor() {
    await runLaunchAction("edit", () => window.openVideoCraft.windows.openEditor(null));
  }

  async function openExistingProject() {
    await runLaunchAction("open-existing", async () => {
      const project = await window.openVideoCraft.projects.openExistingProjectFolder();
      await loadRecentProjects();
      return project ? window.openVideoCraft.windows.openEditor(project.id) : true;
    });
  }

  async function openRecentProject(project: ProjectLibraryEntry) {
    if (!project.available) {
      return;
    }

    await runLaunchAction("edit", () => window.openVideoCraft.windows.openEditor(project.id));
  }

  async function removeRecentProject(projectId: string) {
    await runLaunchAction("remove-recent", async () => {
      await window.openVideoCraft.projects.removeFromRecent(projectId);
      await loadRecentProjects();
      return true;
    });
  }

  async function loadRecentProjects() {
    setRecentProjectsLoading(true);
    try {
      setRecentProjects(await window.openVideoCraft.projects.listRecent());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRecentProjectsLoading(false);
    }
  }

  async function runLaunchAction(
    action: LaunchAction,
    callback: () => Promise<boolean>
  ) {
    setBusyAction(action);
    setErrorMessage(null);

    try {
      await callback();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }

  const actionClassName =
    "group grid min-h-40 content-end justify-items-start gap-2 rounded-[10px] border border-transparent bg-transparent p-4 text-left text-white transition duration-150 hover:-translate-y-0.5 hover:border-emerald-500 focus-visible:-translate-y-0.5 focus-visible:border-emerald-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[linear-gradient(171deg,rgb(13_18_28),rgb(249_115_22)_58%,rgb(125_65_149))] bg-[length:220%_220%] p-8 text-white animate-[launcher-gradient-shift_20s_ease-in-out_infinite] before:pointer-events-none before:absolute before:inset-[-25%_-15%_-35%] before:z-0 before:bg-[radial-gradient(58%_55%_at_50%_100%,rgb(125_65_149_/_0.72),transparent_70%)] before:blur-[34px] before:content-[''] before:animate-[launcher-wave_9s_ease-in-out_infinite]">
      <section className="relative z-10 grid max-h-[calc(100vh-4rem)] w-[min(100%,980px)] gap-5 overflow-auto rounded-[14px] border border-transparent bg-[#121317] p-6 shadow-[0_34px_90px_rgb(0_0_0_/_0.45)]">
        <div className="flex items-center gap-4">
          <div className="relative size-10">
            <img className="block size-full object-contain" src={appLogo} alt="" />
          </div>
          <div>
            <p className="m-0 text-[0.82rem] font-bold uppercase text-slate-400">
              Open Video Craft
            </p>
            <h1 className="m-0 mt-1 text-[1.65rem] font-bold">Create or edit a video</h1>
          </div>
        </div>

        {errorMessage ? (
          <div className="rounded-lg border border-red-400/35 bg-red-500/12 px-4 py-3 text-sm font-semibold text-red-100">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-4">
          <button
            className={cx(actionClassName, "border-emerald-500/40")}
            type="button"
            onClick={() => void openRecorder()}
            disabled={busyAction !== null}
          >
            <ScreenShare className="text-emerald-400" size={28} />
            <span className="text-xl font-extrabold">Record</span>
            <small className="max-w-64 text-[0.8rem] leading-5 text-slate-400">
              Open the floating recorder controller.
            </small>
          </button>

          <button
            className={actionClassName}
            type="button"
            onClick={() => void openEditor()}
            disabled={busyAction !== null}
          >
            <Film className="text-sky-400" size={28} />
            <span className="text-xl font-extrabold">Edit / Import</span>
            <small className="max-w-64 text-[0.8rem] leading-5 text-slate-400">
              Open the editor and import media.
            </small>
          </button>

          <button
            className={actionClassName}
            type="button"
            onClick={() => void openExistingProject()}
            disabled={busyAction !== null}
          >
            <FolderOpen className="text-amber-300" size={28} />
            <span className="text-xl font-extrabold">Open project</span>
            <small className="max-w-64 text-[0.8rem] leading-5 text-slate-400">
              Load an existing Open Video Craft folder.
            </small>
          </button>
        </div>

        <section className="grid gap-3 border-t border-white/10 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 text-base font-extrabold">Recent Projects</h2>
            <button
              className="rounded-md border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-white/10 disabled:cursor-wait disabled:opacity-50"
              type="button"
              onClick={() => void loadRecentProjects()}
              disabled={recentProjectsLoading}
            >
              Refresh
            </button>
          </div>

          {recentProjectsLoading ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-400">
              Loading projects...
            </div>
          ) : recentProjects.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/15 px-4 py-5 text-center text-sm font-semibold text-slate-400">
              No saved projects yet.
            </div>
          ) : (
            <div className="grid gap-2">
              {recentProjects.map((project) => (
                <article
                  className={cx(
                    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.045] p-3",
                    !project.available && "border-amber-300/25 bg-amber-400/[0.06]"
                  )}
                  key={`${project.id}-${project.rootPath}`}
                >
                  <div className="grid min-w-0 gap-1">
                    <div className="flex min-w-0 items-center gap-2">
                      {!project.available ? (
                        <AlertTriangle className="shrink-0 text-amber-300" size={15} />
                      ) : null}
                      <strong className="truncate text-sm">{project.name}</strong>
                      <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-300">
                        {formatProjectStatus(project)}
                      </span>
                    </div>
                    <span className="truncate text-xs font-semibold text-slate-400" title={project.rootPath}>
                      {project.rootPath}
                    </span>
                    <span className="text-[0.68rem] font-semibold text-slate-500">
                      {formatProjectUpdatedAt(project.updatedAt)} - {formatProjectDuration(project.durationMs)} -{" "}
                      {formatMediaAvailability(project)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-extrabold text-emerald-100 hover:bg-emerald-400/18 disabled:cursor-not-allowed disabled:opacity-40"
                      type="button"
                      onClick={() => void openRecentProject(project)}
                      disabled={busyAction !== null || !project.available}
                    >
                      Open
                    </button>
                    <button
                      className="grid size-8 place-items-center rounded-md border border-white/10 bg-white/[0.05] text-slate-300 hover:bg-red-400/15 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-45"
                      type="button"
                      title="Remove from recent projects"
                      onClick={() => void removeRecentProject(project.id)}
                      disabled={busyAction !== null}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function formatProjectStatus(project: ProjectLibraryEntry): string {
  return project.available ? project.status : "missing";
}

function formatProjectUpdatedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
}

function formatProjectDuration(durationMs: number | null): string {
  if (!durationMs || durationMs <= 0) {
    return "No duration";
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatMediaAvailability(project: ProjectLibraryEntry): string {
  const media = [
    project.mediaAvailability.screen ? "screen" : null,
    project.mediaAvailability.camera ? "camera" : null,
    project.mediaAvailability.audio ? "audio" : null
  ].filter(Boolean);

  return media.length > 0 ? media.join(", ") : "no media";
}
