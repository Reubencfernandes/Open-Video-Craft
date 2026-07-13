/**
 * Editor top bar: back to launcher, project name, save, and export.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Menu, Pencil, Save, Upload } from "lucide-react";

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
    <header className="editor-topbar grid grid-cols-[minmax(0,1fr)_minmax(180px,auto)_minmax(0,1fr)] items-center border-b border-white/[0.08] bg-[#171a21] px-2">
      <div className="inline-flex min-w-0 items-center gap-1.5">
        <button
          className="grid size-8 flex-none place-items-center rounded text-slate-300 transition hover:bg-white/[0.07] hover:text-white"
          type="button"
          title="Back to projects"
          onClick={props.onBackHome}
        >
          <Menu size={17} />
        </button>
        <span className="hidden text-[0.78rem] font-semibold text-slate-100 sm:inline">
          Open Video Craft
        </span>
      </div>

      <div
        className="editor-project-name inline-flex h-8 min-w-0 items-center justify-center gap-1.5 px-3 text-xs font-semibold text-slate-200 focus-within:text-white"
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
        <Pencil size={12} className="flex-none text-slate-500" />
      </div>

      <div className="editor-topbar-actions inline-flex min-w-0 justify-end gap-1.5">
        <button
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded px-2.5 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.07] hover:text-white"
          type="button"
          title="Back to projects"
          onClick={props.onBackHome}
        >
          <ChevronLeft size={14} />
          <span className="editor-action-label">Projects</span>
        </button>
        <button
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded px-2.5 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-wait disabled:opacity-55"
          type="button"
          title="Save project (Ctrl+S)"
          disabled={props.saving}
          onClick={() => void props.onSave()}
        >
          <Save size={14} />
          <span className="editor-action-label">{props.saving ? "Saving" : "Save"}</span>
        </button>
        <button
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded bg-[#c9ad73] px-3.5 text-xs font-bold text-[#17130c] transition hover:bg-[#dbc188] disabled:cursor-not-allowed disabled:opacity-55"
          type="button"
          disabled={props.exporting || !props.canExport}
          onClick={props.onOpenExport}
        >
          <Upload size={14} />
          <span className="editor-action-label">Export</span>
        </button>
      </div>
    </header>
  );
}
