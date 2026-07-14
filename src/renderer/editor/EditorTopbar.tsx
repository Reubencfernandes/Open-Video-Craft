/**
 * Editor top bar: wordmark, editable project name, and the AI / Projects /
 * Save / Export actions on the right.
 */
import { useEffect, useRef, useState } from "react";
import { FolderKanban, Pencil, Save, Sparkles, Upload } from "lucide-react";

const topbarActionClassName =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-[0.78rem] font-semibold text-neutral-200 transition hover:bg-white/[0.08] hover:text-white";

export function EditorTopbar(props: {
  projectName: string;
  exporting: boolean;
  canExport: boolean;
  onBackHome: () => void;
  onRename: (name: string) => void;
  onOpenExport: () => void;
  onOpenAi: () => void;
  onSave: () => void;
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
    <header className="editor-topbar grid h-[3.25rem] grid-cols-[minmax(0,1fr)_minmax(180px,auto)_minmax(0,1fr)] items-center bg-[#0b0b0d] px-4">
      <div className="inline-flex min-w-0 items-center gap-1.5">
        <span className="truncate text-[0.9rem] font-bold tracking-tight text-white">
          Open Video Craft
        </span>
      </div>

      <div
        className="editor-project-name inline-flex h-9 min-w-0 items-center justify-center gap-1.5 px-3 text-[0.82rem] font-semibold text-neutral-200 focus-within:text-white"
        onClick={() => inputRef.current?.focus()}
      >
        <input
          ref={inputRef}
          className="min-w-0 flex-1 truncate bg-transparent text-center text-neutral-100 outline-none placeholder:text-neutral-500"
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
        <Pencil size={13} className="flex-none text-neutral-500" />
      </div>

      <div className="editor-topbar-actions inline-flex min-w-0 items-center justify-end gap-1">
        <button className={topbarActionClassName} type="button" title="AI video editing" onClick={props.onOpenAi}>
          <Sparkles size={15} />
          <span className="editor-action-label">AI</span>
        </button>
        <button className={topbarActionClassName} type="button" title="Back to projects" onClick={props.onBackHome}>
          <FolderKanban size={15} />
          <span className="editor-action-label">Projects</span>
        </button>
        <button className={topbarActionClassName} type="button" title="Save project" onClick={props.onSave}>
          <Save size={15} />
          <span className="editor-action-label">Save</span>
        </button>
        <button
          className="ml-1.5 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-white px-4 text-[0.78rem] font-bold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-55"
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
