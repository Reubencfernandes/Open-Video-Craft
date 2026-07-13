/** Persistent launcher navigation and shortcuts to the existing app workflows. */
import { Clapperboard, History, Home, Plus, Video } from "lucide-react";
import type { UpdateStatus } from "../../shared/types";
import appLogo from "../assets/app.png";
import { HomeUpdateStatus } from "./HomeUpdateStatus";

const toolLinkClassName = "flex min-h-11 w-full items-center gap-3 rounded-xl px-4 text-left text-sm text-slate-300 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-45";

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
    <aside className="flex min-h-0 flex-col rounded-2xl bg-[#08090a]/96 p-4 shadow-[0_24px_70px_rgb(0_0_0_/_0.32)]">
      <div className="flex items-center gap-3 px-3 py-2">
        <img className="size-9 rounded-xl object-contain" src={appLogo} alt="" />
        <strong className="text-lg font-semibold tracking-[-0.02em] text-white">Open Video Craft</strong>
      </div>

      <button className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white/[0.055] text-sm font-medium text-white hover:bg-white/[0.09] disabled:opacity-45" type="button" disabled={props.disabled} onClick={props.onNewProject}>
        <Plus size={17} /> New Project
      </button>

      <nav className="mt-6 grid gap-1" aria-label="Primary navigation">
        <button className={`${toolLinkClassName} bg-white/[0.07] text-white`} type="button"><Home size={18} /> Home</button>
      </nav>

      <div className="mt-7 px-2 text-sm text-slate-500">Tools</div>
      <nav className="mt-3 grid gap-1" aria-label="Creation tools">
        <button className={toolLinkClassName} type="button" disabled={props.disabled} onClick={props.onRecord}><Video className="text-rose-400" size={18} /> Record</button>
        <button className={toolLinkClassName} type="button" disabled={props.disabled} onClick={props.onOpenEditor}><Clapperboard className="text-amber-400" size={18} /> Video Editor</button>
      </nav>

      <div className="mt-auto pt-6">
        <HomeUpdateStatus status={props.updateStatus} onInstall={props.onInstallUpdate} />
        <div className="grid grid-cols-3 gap-2">
          <div className="grid min-h-11 place-items-center rounded-xl bg-white/[0.045] text-xs font-semibold text-slate-300" title={`Open Video Craft ${props.version}`}>v{props.version}</div>
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
