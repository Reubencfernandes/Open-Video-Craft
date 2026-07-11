/** Persistent launcher navigation and shortcuts to the existing app workflows. */
import { CircleDot, Film, Headphones, HelpCircle, Home, MessageCircle, Plus, Waves } from "lucide-react";
import appLogo from "../assets/app.png";

const toolLinkClassName = "flex min-h-11 w-full items-center gap-3 rounded-xl px-4 text-left text-sm text-slate-300 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-45";

export function HomeSidebar(props: {
  disabled: boolean;
  onNewProject: () => void;
  onRecord: () => void;
  onOpenEditor: () => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col rounded-2xl border border-white/[0.07] bg-[#08090a]/96 p-4 shadow-[0_24px_70px_rgb(0_0_0_/_0.32)]">
      <div className="flex items-center gap-3 px-3 py-2">
        <img className="size-9 rounded-xl object-contain" src={appLogo} alt="" />
        <strong className="text-lg font-semibold tracking-[-0.02em] text-white">Open Video Craft</strong>
      </div>

      <button className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.055] text-sm font-medium text-white hover:bg-white/[0.09] disabled:opacity-45" type="button" disabled={props.disabled} onClick={props.onNewProject}>
        <Plus size={17} /> New Project
      </button>

      <nav className="mt-6 grid gap-1" aria-label="Primary navigation">
        <button className={`${toolLinkClassName} bg-white/[0.07] text-white`} type="button"><Home size={18} /> Home</button>
      </nav>

      <div className="mt-7 px-2 text-sm text-slate-500">Tools</div>
      <nav className="mt-3 grid gap-1" aria-label="Creation tools">
        <button className={toolLinkClassName} type="button" disabled={props.disabled} onClick={props.onRecord}><CircleDot className="text-rose-400" size={18} /> Record</button>
        <button className={toolLinkClassName} type="button" disabled title="Coming soon"><Waves className="text-emerald-400" size={18} /> Voice Changer</button>
        <button className={toolLinkClassName} type="button" disabled={props.disabled} onClick={props.onOpenEditor}><Film className="text-violet-400" size={18} /> Video Editor</button>
      </nav>

      <div className="mt-auto grid gap-5 pt-6">
        <div className="grid grid-cols-3 gap-2">
          <button className="grid min-h-11 place-items-center rounded-xl bg-white/[0.045] text-slate-300 hover:text-white" type="button" title="Help"><HelpCircle size={17} /></button>
          <button className="grid min-h-11 place-items-center rounded-xl bg-white/[0.045] text-slate-300 hover:text-white" type="button" title="Community"><MessageCircle size={17} /></button>
          <button className="grid min-h-11 place-items-center rounded-xl bg-white/[0.045] text-slate-300 hover:text-white" type="button" title="Audio tools"><Headphones size={17} /></button>
        </div>
        <div className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-slate-500 to-slate-700 text-sm font-semibold text-white">O</div>
      </div>
    </aside>
  );
}
