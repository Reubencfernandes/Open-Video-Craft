/**
 * Launcher composition root.
 *
 * This file owns data loading and desktop actions; visual sections live in
 * ./home so launcher behavior can evolve independently from its presentation.
 */
import { Clapperboard, FolderOpen, Video } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  DesktopPermissionKind,
  DesktopPermissionStatus,
  ProjectLibraryEntry
} from "../shared/types";
import { HomeActionCard } from "./home/HomeActionCard";
import { ChangelogDialog } from "./home/ChangelogDialog";
import { HomeHeader } from "./home/HomeHeader";
import { HomeSidebar } from "./home/HomeSidebar";
import { RecentProjectsSection } from "./home/RecentProjectsSection";
import { latestRelease } from "./home/latest-release";
import { FloatingNotification } from "./notifications/FloatingNotification";
import { PermissionOnboarding } from "./PermissionOnboarding";
import { useAppUpdateStatus } from "./useAppUpdateStatus";

type LaunchAction = "record" | "edit" | "open-existing" | "remove-recent";

const discordContactUrl = "https://discord.gg/ZeDvfMvWwf";

export function App() {
  const [busyAction, setBusyAction] = useState<LaunchAction | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<DesktopPermissionStatus | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [recentProjects, setRecentProjects] = useState<ProjectLibraryEntry[]>([]);
  const [recentProjectsLoading, setRecentProjectsLoading] = useState(true);
  const [projectSearch, setProjectSearch] = useState("");
  const [changelogOpen, setChangelogOpen] = useState(false);
  const { appInfo, updateStatus, installUpdate } = useAppUpdateStatus();

  useEffect(() => {
    void loadRecentProjects();
    void loadPermissionsStatus();
  }, []);

  async function openRecorder() {
    const status = await loadPermissionsStatus();

    if (requiresScreenPermission(status)) {
      setErrorMessage(
        "Screen Recording permission is required before Open Video Craft can list screen sources."
      );
      return;
    }

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

  async function deleteRecentProject(project: ProjectLibraryEntry) {
    await runLaunchAction("remove-recent", async () => {
      if (project.available) {
        await window.openVideoCraft.projects.delete(project.id);
      } else {
        // Unsupported legacy, missing, and corrupt folders must never be
        // deleted as if they were a current project. Forget only the launcher
        // entry and leave the user's files untouched.
        await window.openVideoCraft.projects.removeFromRecent(project.id);
      }
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

  async function loadPermissionsStatus(): Promise<DesktopPermissionStatus | null> {
    setPermissionsLoading(true);
    try {
      const status = await window.openVideoCraft.permissions.getStatus();
      setPermissionStatus(status);
      return status;
    } catch (error) {
      console.warn("Failed to read desktop permissions.", error);
      return null;
    } finally {
      setPermissionsLoading(false);
    }
  }

  async function openPermissionSettings(kind: DesktopPermissionKind) {
    setErrorMessage(null);
    try {
      await window.openVideoCraft.permissions.openSettings(kind);
      await loadPermissionsStatus();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function openPermissionGuide(kind: DesktopPermissionKind) {
    setErrorMessage(null);
    try {
      await window.openVideoCraft.permissions.showGuide(kind);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function requestMediaPermission(kind: Extract<DesktopPermissionKind, "camera" | "microphone">) {
    setErrorMessage(null);
    try {
      await window.openVideoCraft.permissions.requestMedia(kind);
      await loadPermissionsStatus();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
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

  async function openDiscordContact() {
    try {
      await window.openVideoCraft.app.openExternal(discordContactUrl);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  const normalizedSearch = projectSearch.trim().toLocaleLowerCase();
  const visibleProjects = normalizedSearch
    ? recentProjects.filter((project) => project.name.toLocaleLowerCase().includes(normalizedSearch))
    : recentProjects;

  return (
    <main className="grid h-dvh min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-2 overflow-hidden bg-[#0c0c0e] p-2 text-white md:grid-cols-[76px_minmax(0,1fr)] md:grid-rows-1 md:gap-3 md:p-3 xl:grid-cols-[220px_minmax(0,1fr)]">
      <HomeSidebar
        disabled={busyAction !== null}
        version={appInfo?.version ?? latestRelease.version}
        updateStatus={updateStatus}
        onInstallUpdate={() => void installUpdate()}
        onNewProject={() => void openEditor()}
        onRecord={() => void openRecorder()}
        onOpenEditor={() => void openEditor()}
        onContact={() => void openDiscordContact()}
        onOpenChangelog={() => setChangelogOpen(true)}
      />

      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl bg-[#121214] shadow-[0_22px_70px_rgb(0_0_0_/_0.2)]">
        <HomeHeader search={projectSearch} onSearchChange={setProjectSearch} />

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-3 sm:px-5 xl:px-6">
          <div className="grid min-w-0">
            <div className="grid min-w-0 content-start gap-6">
              <section className="grid gap-3" aria-labelledby="quick-start-title">
                <div>
                  <h2 id="quick-start-title" className="m-0 text-base font-semibold text-white">Quick start</h2>
                  <p className="m-0 mt-1 text-xs text-neutral-500">Choose how you want to begin.</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <HomeActionCard icon={<Video size={21} />} title="Record" description="Capture your screen, camera, and voice." actionLabel="Start recording" disabled={busyAction !== null} onAction={() => void openRecorder()} />
                  <HomeActionCard icon={<Clapperboard size={21} />} title="Video editor" description="Start a new edit from imported media." actionLabel="Open editor" disabled={busyAction !== null} onAction={() => void openEditor()} />
                  <HomeActionCard icon={<FolderOpen size={21} />} title="Open project" description="Browse an existing project folder." actionLabel="Browse projects" disabled={busyAction !== null} onAction={() => void openExistingProject()} />
                </div>
              </section>

              <PermissionOnboarding loading={permissionsLoading} status={permissionStatus} onOpenGuide={openPermissionGuide} onOpenSettings={openPermissionSettings} onRefresh={() => void loadPermissionsStatus()} onRequestMedia={requestMediaPermission} />

              <RecentProjectsSection projects={visibleProjects} loading={recentProjectsLoading} disabled={busyAction !== null} onRefresh={() => void loadRecentProjects()} onOpen={(project) => void openRecentProject(project)} onDelete={(project) => void deleteRecentProject(project)} />
            </div>
          </div>
        </div>
      </section>
      {errorMessage ? <FloatingNotification kind="error" title="We are so sorry!" message={errorMessage} onDismiss={() => setErrorMessage(null)} /> : null}
      <ChangelogDialog open={changelogOpen} onClose={() => setChangelogOpen(false)} />
    </main>
  );
}

function requiresScreenPermission(status: DesktopPermissionStatus | null): boolean {
  return (
    status?.platform === "darwin" &&
    (status.screen === "denied" || status.screen === "restricted")
  );
}
