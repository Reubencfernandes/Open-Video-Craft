/** Persistent launcher navigation and shortcuts to the existing app workflows. */
import { CircleDot, Contact, Film, History, Home, Plus } from "lucide-react";
import appLogo from "../assets/app.png";

const toolLinkClassName = "flex min-h-11 w-full items-center gap-3 rounded-xl px-4 text-left text-sm text-slate-300 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-45";

export function HomeSidebar(props: {
  disabled: boolean;
  onNewProject: () => void;
  onRecord: () => void;
  onOpenEditor: () => void;
  version: string;
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
        <button className={toolLinkClassName} type="button" disabled={props.disabled} onClick={props.onRecord}><CircleDot className="text-rose-400" size={18} /> Record</button>
        <button className={toolLinkClassName} type="button" disabled={props.disabled} onClick={props.onOpenEditor}><Film className="text-amber-400" size={18} /> Video Editor</button>
      </nav>

      <div className="mt-auto pt-6">
        <div className="grid grid-cols-3 gap-2">
          <div className="grid min-h-11 place-items-center rounded-xl bg-white/[0.045] text-xs font-semibold text-slate-300" title={`Open Video Craft ${props.version}`}>v{props.version}</div>
          <button className="grid min-h-11 place-items-center rounded-xl bg-white/[0.045] text-slate-300 hover:text-white" type="button" title="Contact on Discord" onClick={props.onContact}><Contact size={17} /></button>
          <button className="grid min-h-11 place-items-center rounded-xl bg-white/[0.045] text-slate-300 hover:text-white" type="button" title="Changelog" onClick={props.onOpenChangelog}><History size={17} /></button>
        </div>
      </div>
    </aside>
  );
}
