/** Persistent launcher navigation and shortcuts to the existing app workflows. */
import { Clapperboard, History, LayoutDashboard, Video } from "lucide-react";
import type { UpdateStatus } from "../../shared/types";
import appLogo from "../assets/app.png";
import { HomeUpdateStatus } from "./HomeUpdateStatus";
import { NewProjectButton } from "./NewProjectButton";

const toolLinkClassName = "flex size-10 shrink-0 items-center justify-center gap-3 rounded-xl text-left text-xs font-medium text-neutral-400 transition hover:bg-white/[0.055] hover:text-white disabled:opacity-45 md:h-10 md:w-full xl:justify-start xl:px-3";

export function HomeSidebar(props: {
  disabled: boolean;
  onNewProject: () => void;
  onRecord: () => void;
  onOpenEditor: () => void;
  version: string;
  updateStatus: UpdateStatus | null;
  onInstallUpdate: () => void;
  onContact: () => void;
  onOpenChangelog: () => void;
}) {
  return (
    <aside className="flex min-h-0 min-w-0 items-center gap-2 overflow-x-auto rounded-2xl bg-[#151517] p-2 shadow-[0_18px_55px_rgb(0_0_0_/_0.2)] md:flex-col md:overflow-x-hidden xl:items-stretch xl:p-3">
      <div className="flex shrink-0 items-center gap-3 p-1 xl:px-2 xl:py-2">
        <img className="size-9 rounded-xl object-contain shadow-[0_6px_20px_rgb(0_0_0_/_0.24)]" src={appLogo} alt="" />
        <span className="hidden min-w-0 xl:block">
          <strong className="block truncate text-sm font-semibold tracking-[-0.02em] text-white">Open Video Craft</strong>
          <span className="mt-0.5 block text-[0.62rem] text-neutral-600">Creative studio</span>
        </span>
      </div>

      <NewProjectButton disabled={props.disabled} onClick={props.onNewProject} />

      <nav className="hidden gap-1 md:mt-4 md:grid md:w-full" aria-label="Primary navigation">
        <button className={`${toolLinkClassName} bg-white/[0.075] text-white`} type="button" title="Dashboard"><LayoutDashboard size={17} /> <span className="hidden xl:inline">Dashboard</span></button>
      </nav>

      <div className="hidden px-2 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-neutral-700 xl:mt-6 xl:block">Create</div>
      <nav className="flex gap-1 md:mt-2 md:grid md:w-full" aria-label="Creation tools">
        <button className={toolLinkClassName} title="Record" type="button" disabled={props.disabled} onClick={props.onRecord}><Video size={17} /> <span className="hidden xl:inline">Record video</span></button>
        <button className={toolLinkClassName} title="Video Editor" type="button" disabled={props.disabled} onClick={props.onOpenEditor}><Clapperboard size={17} /> <span className="hidden xl:inline">Video editor</span></button>
      </nav>

      <div className="hidden px-2 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-neutral-700 xl:mt-5 xl:block">Library</div>
      <nav className="hidden gap-1 md:mt-2 md:grid md:w-full" aria-label="Library tools">
        <button className={toolLinkClassName} title="Changelog" type="button" onClick={props.onOpenChangelog}><History size={17} /> <span className="hidden xl:inline">What’s new</span></button>
      </nav>

      <div className="ml-auto shrink-0 md:mt-auto md:ml-0 md:w-full md:pt-4 xl:pt-6">
        <div className="hidden xl:block"><HomeUpdateStatus status={props.updateStatus} onInstall={props.onInstallUpdate} /></div>
        <div className="flex gap-1 md:grid md:grid-cols-1 md:gap-1.5 xl:grid-cols-[1fr_auto]">
          <div className="hidden min-h-10 items-center rounded-xl bg-white/[0.035] px-3 text-[0.65rem] font-semibold text-neutral-500 xl:flex" title={`Open Video Craft ${props.version}`}>Version {props.version}</div>
          <button className="grid size-10 place-items-center rounded-xl bg-white/[0.04] text-neutral-500 transition hover:bg-[#5865f2]/20 hover:text-[#aab1ff]" type="button" title="Join our Discord" aria-label="Join our Discord" onClick={props.onContact}>
            <svg width="19" height="15" viewBox="0 0 24 18" fill="currentColor" aria-hidden="true">
              <path d="M20.3 1.5A19.4 19.4 0 0 0 15.6 0l-.6 1.2a17 17 0 0 0-6 0L8.4 0a19.5 19.5 0 0 0-4.7 1.5C.7 5.9-.1 10.2.3 14.4a19 19 0 0 0 5.8 3c.5-.6.9-1.3 1.3-2a12 12 0 0 1-2-1l.5-.4a13.9 13.9 0 0 0 12.2 0l.5.4a13 13 0 0 1-2 1c.4.7.8 1.4 1.3 2a19 19 0 0 0 5.8-3c.5-4.9-.8-9.1-3.4-12.9ZM8 11.8c-1.2 0-2.1-1.1-2.1-2.4C5.9 8 6.8 7 8 7s2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Zm8 0c-1.2 0-2.1-1.1-2.1-2.4C13.9 8 14.8 7 16 7s2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Z" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
