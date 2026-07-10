/**
 * Editor top bar: back to launcher, project name, save, and export.
 */
import { Download, Home, Save } from "lucide-react";
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
    <header className="grid grid-cols-[minmax(230px,1fr)_minmax(160px,auto)_minmax(220px,1fr)] items-center gap-4 border-b border-white/[0.07] bg-[#0d1016]/98 px-[1.1rem] py-3">
      <div className="inline-flex min-w-0 items-center gap-3">
        <div className="relative size-10">
          <img className="block size-full object-contain" src={appLogo} alt="" />
        </div>
        <div>
          <strong className="block text-[0.9rem] font-extrabold text-white">
            Open Video Craft
          </strong>
          <small className="block text-[0.68rem] font-bold text-slate-400">
            Video Editor
          </small>
        </div>
      </div>

      <button
        className="inline-flex min-h-[2.15rem] min-w-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] px-3 text-sm font-bold text-slate-200"
        type="button"
      >
        <span className="max-w-[28rem] truncate">{props.projectName}</span>
      </button>

      <div className="inline-flex justify-end gap-3">
        <button
          className="inline-flex size-[2.7rem] items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.06] text-white hover:bg-white/10"
          type="button"
          title="Back to main menu"
          onClick={props.onBackHome}
        >
          <Home size={17} />
        </button>
        <button
          className="inline-flex size-[2.7rem] items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.06] text-white hover:bg-white/10"
          type="button"
          title="Save project (Ctrl+S)"
          onClick={props.onSave}
        >
          <Save size={17} />
        </button>
        <button
          className="inline-flex min-h-[2.7rem] items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-[#e7f7ff] px-6 text-sm font-extrabold text-[#071018] disabled:cursor-not-allowed disabled:opacity-55"
          type="button"
          disabled={props.exporting || !props.canExport}
          onClick={props.onOpenExport}
        >
          <Download size={16} />
          Export
        </button>
      </div>
    </header>
  );
}
