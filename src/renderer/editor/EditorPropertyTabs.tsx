/** Inspector tab strip shared by video, audio, zoom, and contextual tools. */
import { editorTools } from "./tools";
import type { EditorTool } from "./types";

const primaryTabs: Array<{ tool: EditorTool; label: string }> = [
  { tool: "layout", label: "Video" },
  { tool: "audio", label: "Audio" },
  { tool: "zoom", label: "Zoom" }
];

export function EditorPropertyTabs(props: {
  effectiveTool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
}) {
  // Less common tools occupy a contextual fourth tab instead of crowding the
  // persistent Video / Audio / Zoom navigation.
  const contextualTool = primaryTabs.some((tab) => tab.tool === props.effectiveTool)
    ? null
    : editorTools.find((tool) => tool.id === props.effectiveTool) ?? null;

  return (
    <div className="flex gap-1 border-b border-white/[0.06] p-2" role="tablist">
      {primaryTabs.map((tab) => (
        <button
          className={`min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-[0.8rem] font-semibold transition ${props.effectiveTool === tab.tool ? "bg-violet-500/[0.08] text-white shadow-[inset_0_-2px_#d946ef]" : "text-slate-400 hover:bg-white/[0.05] hover:text-white"}`}
          type="button"
          role="tab"
          aria-selected={props.effectiveTool === tab.tool}
          key={tab.tool}
          onClick={() => props.onToolChange(tab.tool)}
        >
          {tab.label}
        </button>
      ))}
      {contextualTool ? (
        <button className="min-w-0 flex-1 truncate rounded-lg bg-violet-500/[0.08] px-3 py-2 text-[0.8rem] font-semibold text-white shadow-[inset_0_-2px_#d946ef]" type="button" role="tab" aria-selected="true">
          {contextualTool.label}
        </button>
      ) : null}
    </div>
  );
}
