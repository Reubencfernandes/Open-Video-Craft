import { editorTools } from "./tools";
import type { EditorTool } from "./types";

export function ToolRail(props: {
  activeTool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
}) {
  return (
    <aside
      className="grid content-start justify-items-center gap-2 overflow-auto bg-transparent p-2"
      aria-label="Editor tools"
    >
      {editorTools.map((tool) => (
        <button
          className={`relative grid w-full min-w-0 justify-items-center gap-0.5 px-1 py-2 text-[0.58rem] font-bold ${
            props.activeTool === tool.id
              ? "text-slate-100 before:absolute before:bottom-2 before:left-[-0.45rem] before:top-2 before:w-[3px] before:rounded-full before:bg-amber-500 before:content-['']"
              : "text-slate-400 hover:text-slate-100"
          }`}
          type="button"
          title={tool.label}
          key={tool.id}
          onClick={() => props.onToolChange(tool.id)}
        >
          <img
            className="size-[3.15rem] object-contain drop-shadow-[0_5px_8px_rgb(0_0_0_/_0.28)]"
            src={tool.image}
            alt=""
            aria-hidden="true"
          />
          <span className="max-w-full truncate">{tool.label}</span>
        </button>
      ))}
    </aside>
  );
}
