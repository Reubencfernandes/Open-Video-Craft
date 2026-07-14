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
      className="editor-tool-rail grid w-20 flex-none content-start justify-items-stretch gap-1 overflow-auto bg-[#0b0b0d] px-1.5 py-2"
      aria-label="Editor tools"
    >
      {editorTools.map((tool) => (
        <button
          className={`flex min-h-[3.4rem] w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-[10px] font-medium leading-tight transition ${
            props.activeTool === tool.id
              ? "bg-white/[0.12] text-white"
              : "bg-transparent text-neutral-400 hover:bg-white/[0.06] hover:text-white"
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
