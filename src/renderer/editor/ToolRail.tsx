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
      className="grid content-start justify-items-stretch gap-1 overflow-auto rounded-xl border border-white/[0.07] bg-[#101113] p-1"
      aria-label="Editor tools"
    >
      {editorTools.map((tool) => (
        <button
          className={`relative grid min-h-[3.95rem] w-full min-w-0 content-center justify-items-center gap-1 rounded-xl border text-[0.65rem] font-medium transition ${
            props.activeTool === tool.id
              ? "border-white/[0.09] bg-white/[0.04] text-white before:absolute before:bottom-2 before:left-[-0.3rem] before:top-2 before:w-[2px] before:rounded-full before:bg-amber-400 before:content-['']"
              : "border-transparent bg-transparent text-slate-300 hover:bg-white/[0.035] hover:text-white"
          }`}
          type="button"
          title={tool.label}
          key={tool.id}
          onClick={() => props.onToolChange(tool.id)}
        >
          <span
            className={`grid place-items-center ${props.activeTool === tool.id ? "text-amber-300" : "text-slate-300"}`}
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
