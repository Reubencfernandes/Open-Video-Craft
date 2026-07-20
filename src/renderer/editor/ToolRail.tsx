/**
 * Left tool rail: one artwork button per editor tool.
 */
import { editorTools } from "./tools";
import type { EditorTool } from "./types";

export function ToolRail(props: {
  activeTool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
}) {
  const activeToolIndex = Math.max(
    0,
    editorTools.findIndex((tool) => tool.id === props.activeTool)
  );

  return (
    <aside
      className="editor-tool-rail relative grid w-20 flex-none content-start justify-items-stretch gap-1 overflow-auto bg-[#0b0b0d] px-1.5 py-2"
      aria-label="Editor tools"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1.5 right-1.5 top-2 h-[3.4rem] rounded-xl bg-white/[0.12] shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.025)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform motion-reduce:transition-none"
        data-tool-rail-indicator
        style={{ transform: `translateY(${activeToolIndex * 3.65}rem)` }}
      />
      {editorTools.map((tool) => (
        <button
          className={`editor-choice-button relative z-10 flex min-h-[3.4rem] w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-[10px] font-medium leading-tight ${
            props.activeTool === tool.id
              ? "bg-transparent text-white"
              : "bg-transparent text-neutral-400 hover:bg-white/[0.06] hover:text-white"
          }`}
          type="button"
          title={tool.label}
          key={tool.id}
          aria-pressed={props.activeTool === tool.id}
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
