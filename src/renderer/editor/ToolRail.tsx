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
      className="editor-tool-rail grid w-[4.5rem] flex-none content-start justify-items-stretch overflow-auto bg-[#1c2028]"
      aria-label="Editor tools"
    >
      {editorTools.map((tool) => (
        <button
          className={`flex min-h-14 w-full min-w-0 flex-col items-center justify-center gap-1 px-1 text-center text-[10px] font-medium leading-tight transition ${
            props.activeTool === tool.id
              ? "bg-white/[0.065] text-white"
              : "bg-transparent text-slate-400 hover:bg-white/[0.035] hover:text-white"
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
          <span className="w-full truncate">{tool.label}</span>
        </button>
      ))}
    </aside>
  );
}
