/**
 * Launcher composition root.
 *
 * This file owns data loading and desktop actions; visual sections live in
 * ./home so launcher behavior can evolve independently from its presentation.
 */
import { CircleDot, FolderOpen, Scissors } from "lucide-react";
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
import { UpdateNotification } from "./notifications/UpdateNotification";
import { PermissionOnboarding } from "./PermissionOnboarding";
import { useAppUpdateStatus } from "./useAppUpdateStatus";

type LaunchAction = "record" | "edit" | "open-existing" | "remove-recent";

// Safe public fallback until the owner supplies a profile or community invite.
const discordContactUrl = "https://discord.com/";

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

  async function deleteRecentProject(projectId: string) {
    await runLaunchAction("remove-recent", async () => {
      await window.openVideoCraft.projects.delete(projectId);
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
    <main className="grid h-screen min-h-[760px] grid-cols-[280px_minmax(0,1fr)] gap-4 overflow-hidden bg-[radial-gradient(circle_at_92%_8%,rgb(55_65_81_/_0.16),transparent_28%),#050606] p-3 text-white">
      <HomeSidebar
        disabled={busyAction !== null}
        version={appInfo?.version ?? latestRelease.version}
        onNewProject={() => void openEditor()}
        onRecord={() => void openRecorder()}
        onOpenEditor={() => void openEditor()}
        onContact={() => void openDiscordContact()}
        onOpenChangelog={() => setChangelogOpen(true)}
      />

      <section className="min-h-0 overflow-auto rounded-2xl bg-[linear-gradient(145deg,#101112,#090a0b)] px-9 py-8 shadow-[0_24px_80px_rgb(0_0_0_/_0.3)]">
        <div className="grid gap-8">
          <HomeHeader search={projectSearch} onSearchChange={setProjectSearch} />

          <div className="grid grid-cols-3 gap-5">
            <HomeActionCard icon={<CircleDot className="text-rose-400" size={27} />} title="Record" description="Record your screen, webcam, or voice with high quality." actionLabel="Start Recording" disabled={busyAction !== null} onAction={() => void openRecorder()} />
            <HomeActionCard icon={<Scissors className="text-amber-400" size={27} />} title="Edit a Project" description="Open the editor and start creating your next video." actionLabel="Open Editor" disabled={busyAction !== null} onAction={() => void openEditor()} />
            <HomeActionCard icon={<FolderOpen className="text-emerald-400" size={27} />} title="Open a Project" description="Browse and open any of your saved projects." actionLabel="Browse Projects" disabled={busyAction !== null} onAction={() => void openExistingProject()} />
          </div>

          <PermissionOnboarding loading={permissionsLoading} status={permissionStatus} onOpenGuide={openPermissionGuide} onOpenSettings={openPermissionSettings} onRefresh={() => void loadPermissionsStatus()} onRequestMedia={requestMediaPermission} />

          <RecentProjectsSection projects={visibleProjects} loading={recentProjectsLoading} disabled={busyAction !== null} onRefresh={() => void loadRecentProjects()} onOpen={(project) => void openRecentProject(project)} onDelete={(projectId) => void deleteRecentProject(projectId)} />
        </div>
      </section>
      {errorMessage ? <FloatingNotification kind="error" title="We are so sorry!" message={errorMessage} onDismiss={() => setErrorMessage(null)} /> : null}
      {!errorMessage ? <UpdateNotification status={updateStatus} onInstall={() => void installUpdate()} /> : null}
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
