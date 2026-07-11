/** Metadata-only inspector shown while the Media rail category is selected. */
import { FileAudio, FileImage, FileVideo } from "lucide-react";
import type { EditorMediaItem } from "../types";
import { formatSeconds } from "../utils";

export function MediaInspectorPanel({ item }: { item: EditorMediaItem | null }) {
  if (!item) {
    return <div className="grid min-h-40 place-items-center rounded-xl bg-white/[0.025] p-5 text-center text-sm leading-6 text-slate-400">Select media from the library to view its details.</div>;
  }

  const Icon = item.kind === "audio" ? FileAudio : item.kind === "image" ? FileImage : FileVideo;
  return (
    <div className="grid content-start gap-4">
      <div className="flex items-center gap-3 rounded-xl bg-white/[0.035] p-3"><span className="grid size-10 place-items-center rounded-lg bg-amber-500/10 text-amber-300"><Icon size={20} /></span><div className="min-w-0"><strong className="block truncate text-sm text-white">{item.name}</strong><span className="text-xs capitalize text-slate-500">{item.kind} media</span></div></div>
      <dl className="m-0 grid gap-3 text-xs"><MetadataRow label="Source" value={item.origin === "project" ? "Project recording" : "Imported media"} /><MetadataRow label="Track" value={item.track} /><MetadataRow label="Duration" value={item.duration ? formatSeconds(item.duration) : "Reading metadata…"} />{item.extension ? <MetadataRow label="Format" value={item.extension.toUpperCase()} /> : null}</dl>
    </div>
  );
}

function MetadataRow(props: { label: string; value: string }) {
  return <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 border-b border-white/[0.05] pb-3"><dt className="text-slate-500">{props.label}</dt><dd className="m-0 min-w-0 truncate capitalize text-slate-200">{props.value}</dd></div>;
}
