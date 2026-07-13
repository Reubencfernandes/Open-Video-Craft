/**
 * Left tool rail: one artwork button per editor tool.
 */
import { editorTools } from "./tools";
import type { EditorTool } from "./types";

export function ToolRail(props: {
  activeTool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
}) {
  return (
    <aside
      className="editor-tool-rail grid flex-none content-start justify-items-stretch overflow-auto border-b border-white/[0.08] bg-[#1c2028]"
      aria-label="Editor tools"
    >
      {editorTools.map((tool) => (
        <button
          className={`flex min-h-10 w-full min-w-0 items-center gap-3 border-b border-white/[0.06] px-3 text-left text-xs font-medium transition ${
            props.activeTool === tool.id
              ? "bg-white/[0.065] text-[#d8bd82] shadow-[inset_3px_0_0_#c9ad73]"
              : "bg-transparent text-slate-300 hover:bg-white/[0.035] hover:text-white"
          }`}
          type="button"
          title={tool.label}
          key={tool.id}
          onClick={() => props.onToolChange(tool.id)}
        >
          <span
            className="grid size-5 flex-none place-items-center"
            aria-hidden="true"
          >
            {tool.icon}
          </span>
          <span className="min-w-0 flex-1 truncate">{tool.label}</span>
        </button>
      ))}
    </aside>
  );
}
