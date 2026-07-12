/**
 * Editor top bar: back to launcher, project name, save, and export.
 */
import { useEffect, useRef, useState } from "react";
import { Home, Pencil, Save, Upload } from "lucide-react";
import appLogo from "../assets/app.png";

export function EditorTopbar(props: {
  projectName: string;
  exporting: boolean;
  canExport: boolean;
  saving: boolean;
  onBackHome: () => void;
  onRename: (name: string) => void;
  onSave: () => Promise<void>;
  onOpenExport: () => void;
}) {
  const [draftName, setDraftName] = useState(props.projectName);
  const [editingName, setEditingName] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the field in sync with the loaded/renamed project unless the user is
  // mid-edit (so remote updates never clobber their keystrokes).
  useEffect(() => {
    if (!editingName) {
      setDraftName(props.projectName);
    }
  }, [props.projectName, editingName]);

  const commitName = () => {
    setEditingName(false);
    const next = draftName.trim();
    if (next && next !== props.projectName) {
      props.onRename(next);
    } else {
      setDraftName(props.projectName);
    }
  };

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

      <div
        className="inline-flex min-h-[3rem] min-w-[10.5rem] items-center justify-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.025] px-5 text-sm font-semibold text-slate-100 shadow-[inset_0_1px_rgb(255_255_255_/_0.03)] focus-within:border-white/[0.24]"
        onClick={() => inputRef.current?.focus()}
      >
        <input
          ref={inputRef}
          className="min-w-0 flex-1 truncate bg-transparent text-center text-slate-100 outline-none placeholder:text-slate-500"
          value={draftName}
          placeholder="New Edit"
          aria-label="Project name"
          spellCheck={false}
          onChange={(event) => setDraftName(event.target.value)}
          onFocus={() => setEditingName(true)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              setDraftName(props.projectName);
              setEditingName(false);
              event.currentTarget.blur();
            }
          }}
        />
        <Pencil size={15} className="flex-none text-slate-400" />
      </div>

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
          className="inline-flex min-h-[3rem] items-center justify-center gap-2 rounded-xl bg-white/[0.08] px-5 text-sm font-bold text-white transition hover:bg-white/[0.13] disabled:cursor-wait disabled:opacity-55"
          type="button"
          title="Save project (Ctrl+S)"
          disabled={props.saving}
          onClick={() => void props.onSave()}
        >
          <Save size={17} />
          {props.saving ? "Saving" : "Save"}
        </button>
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
