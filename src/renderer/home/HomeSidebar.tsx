/** Persistent launcher navigation and shortcuts to the existing app workflows. */
import { Clapperboard, History, Home, Plus, Video } from "lucide-react";
import type { UpdateStatus } from "../../shared/types";
import appLogo from "../assets/app.png";
import { HomeUpdateStatus } from "./HomeUpdateStatus";

const toolLinkClassName = "flex size-10 shrink-0 items-center justify-center gap-3 rounded-xl text-left text-sm text-slate-300 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-45 md:h-11 md:w-full xl:justify-start xl:px-4";

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
    <aside className="flex min-h-0 min-w-0 items-center gap-2 overflow-x-auto rounded-2xl bg-[#0b0b0d] p-2 md:flex-col md:overflow-x-hidden xl:items-stretch xl:p-4">
      <div className="flex shrink-0 items-center gap-3 p-1 xl:px-3 xl:py-2">
        <img className="size-9 rounded-xl object-contain" src={appLogo} alt="" />
        <strong className="hidden text-lg font-semibold tracking-[-0.02em] text-white xl:block">Open Video Craft</strong>
      </div>

      <button className="inline-flex size-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-white text-sm font-bold text-black transition hover:bg-neutral-200 disabled:opacity-45 md:mt-4 md:size-11 xl:mt-5 xl:min-h-12 xl:w-full" type="button" title="New Project" disabled={props.disabled} onClick={props.onNewProject}>
        <Plus size={17} /> <span className="hidden xl:inline">New Project</span>
      </button>

      <nav className="hidden gap-1 md:mt-5 md:grid md:w-full" aria-label="Primary navigation">
        <button className={`${toolLinkClassName} bg-white/[0.07] text-white`} type="button" title="Home"><Home size={18} /> <span className="hidden xl:inline">Home</span></button>
      </nav>

      <div className="hidden px-2 text-sm text-slate-500 xl:mt-7 xl:block">Tools</div>
      <nav className="flex gap-1 md:mt-3 md:grid md:w-full" aria-label="Creation tools">
        <button className={toolLinkClassName} title="Record" type="button" disabled={props.disabled} onClick={props.onRecord}><Video size={18} /> <span className="hidden xl:inline">Record</span></button>
        <button className={toolLinkClassName} title="Video Editor" type="button" disabled={props.disabled} onClick={props.onOpenEditor}><Clapperboard size={18} /> <span className="hidden xl:inline">Video Editor</span></button>
      </nav>

      <div className="ml-auto shrink-0 md:mt-auto md:ml-0 md:w-full md:pt-4 xl:pt-6">
        <div className="hidden xl:block"><HomeUpdateStatus status={props.updateStatus} onInstall={props.onInstallUpdate} /></div>
        <div className="flex gap-1 md:grid md:grid-cols-1 md:gap-2 xl:grid-cols-3">
          <div className="hidden min-h-10 place-items-center rounded-xl bg-white/[0.045] text-xs font-semibold text-slate-300 xl:grid" title={`Open Video Craft ${props.version}`}>v{props.version}</div>
          <button className="grid min-h-11 place-items-center rounded-xl bg-white/[0.045] text-slate-300 transition hover:bg-[#5865f2]/20 hover:text-[#aab1ff]" type="button" title="Join our Discord" aria-label="Join our Discord" onClick={props.onContact}>
            <svg width="19" height="15" viewBox="0 0 24 18" fill="currentColor" aria-hidden="true">
              <path d="M20.3 1.5A19.4 19.4 0 0 0 15.6 0l-.6 1.2a17 17 0 0 0-6 0L8.4 0a19.5 19.5 0 0 0-4.7 1.5C.7 5.9-.1 10.2.3 14.4a19 19 0 0 0 5.8 3c.5-.6.9-1.3 1.3-2a12 12 0 0 1-2-1l.5-.4a13.9 13.9 0 0 0 12.2 0l.5.4a13 13 0 0 1-2 1c.4.7.8 1.4 1.3 2a19 19 0 0 0 5.8-3c.5-4.9-.8-9.1-3.4-12.9ZM8 11.8c-1.2 0-2.1-1.1-2.1-2.4C5.9 8 6.8 7 8 7s2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Zm8 0c-1.2 0-2.1-1.1-2.1-2.4C13.9 8 14.8 7 16 7s2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Z" />
            </svg>
          </button>
          <button className="grid min-h-11 place-items-center rounded-xl bg-white/[0.045] text-slate-300 hover:text-white" type="button" title="Changelog" aria-label="Changelog" onClick={props.onOpenChangelog}><History size={17} /></button>
        </div>
      </div>
    </aside>
  );
}
