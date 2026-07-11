/**
 * Editor top bar: back to launcher, project name, save, and export.
 */
import { Camera, Home, Plus, Settings, Upload } from "lucide-react";
import appLogo from "../assets/app.png";

export function EditorTopbar(props: {
  projectName: string;
  exporting: boolean;
  canExport: boolean;
  onBackHome: () => void;
  onSave: () => void;
  onOpenExport: () => void;
}) {
  return (
    <header className="grid grid-cols-[minmax(230px,1fr)_minmax(160px,auto)_minmax(260px,1fr)] items-center gap-4 border-b border-white/[0.06] bg-[#08090b]/95 px-6 py-4">
      <div className="inline-flex min-w-0 items-center gap-3">
        <div className="relative size-12 overflow-hidden rounded-2xl shadow-[0_8px_25px_rgb(31_91_255_/_0.3)]">
          <img className="block size-full object-contain" src={appLogo} alt="" />
        </div>
        <div>
          <strong className="block text-[1.15rem] font-extrabold tracking-[-0.02em] text-white">
            Open Video Craft
          </strong>
          <small className="mt-0.5 block text-[0.72rem] font-medium text-slate-400">
            Video Editor
          </small>
        </div>
      </div>

      <button
        className="inline-flex min-h-[3rem] min-w-[10.5rem] items-center justify-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.025] px-5 text-sm font-semibold text-slate-100 shadow-[inset_0_1px_rgb(255_255_255_/_0.03)]"
        type="button"
      >
        <span className="max-w-[28rem] truncate">{props.projectName || "New Edit"}</span>
        <Plus size={17} />
      </button>

      <div className="inline-flex justify-end gap-3">
        <button
          className="inline-flex size-[3rem] items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.035] text-white hover:bg-white/10"
          type="button"
          title="Back to main menu"
          onClick={props.onBackHome}
        >
          <Home size={17} />
        </button>
        <button
          className="inline-flex size-[3rem] items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.035] text-white hover:bg-white/10"
          type="button"
          title="Save project (Ctrl+S)"
          onClick={props.onSave}
        >
          <Camera size={18} />
        </button>
        <button className="inline-flex size-[3rem] items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.035] text-white hover:bg-white/10" type="button" title="Settings"><Settings size={18} /></button>
        <button
          className="inline-flex min-h-[3rem] items-center justify-center gap-2 rounded-xl bg-white px-7 text-sm font-extrabold text-black shadow-[0_8px_24px_rgb(255_255_255_/_0.08)] hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-55"
          type="button"
          disabled={props.exporting || !props.canExport}
          onClick={props.onOpenExport}
        >
          <Upload size={17} />
          Export
        </button>
      </div>
    </header>
  );
}
