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
      className="grid content-start justify-items-stretch gap-1 overflow-auto bg-[#101113] p-1"
      aria-label="Editor tools"
    >
      {editorTools.map((tool) => (
        <button
          className={`grid min-h-[3.95rem] w-full min-w-0 content-center justify-items-center gap-1 rounded-xl text-[0.65rem] font-medium transition ${
            props.activeTool === tool.id
              ? "bg-white/[0.075] text-amber-300"
              : "bg-transparent text-slate-300 hover:bg-white/[0.035] hover:text-white"
          }`}
          type="button"
          title={tool.label}
          key={tool.id}
          onClick={() => props.onToolChange(tool.id)}
        >
          <span
            className="grid place-items-center"
            aria-hidden="true"
          >
            {tool.icon}
          </span>
          <span className="max-w-full truncate">{tool.label}</span>
        </button>
      ))}
    </aside>
  );
}
