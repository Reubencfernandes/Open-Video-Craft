import { RotateCcw } from "lucide-react";
import type { EditorMutation } from "../../shared/editor-domain";

/** Displays the latest checkpoint-backed agent mutation and its grouped undo. */
export function AiLastEditCard(props: {
  mutation: EditorMutation;
  disabled: boolean;
  onUndo: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/15 p-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-white">Last AI edit</p>
        <p className="truncate text-[11px] text-slate-400">{props.mutation.summary ?? props.mutation.editId}</p>
      </div>
      <button
        className="inline-flex h-8 flex-none items-center gap-1.5 rounded border border-white/10 px-3 text-xs text-slate-200 hover:bg-white/10"
        type="button"
        disabled={props.disabled}
        onClick={props.onUndo}
      >
        <RotateCcw size={13} /> Undo AI edit
      </button>
    </div>
  );
}
