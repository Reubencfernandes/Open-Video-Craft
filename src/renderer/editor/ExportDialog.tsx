/**
 * Export modal: format and resolution selection.
 */
import { Download, X } from "lucide-react";
import type {
  ExportProgress,
  ExportResolution,
  ExportSubtitleMode,
  ExportVideoFormat
} from "../../shared/types";

const exportFormats: ExportVideoFormat[] = ["mp4", "webm", "mov"];
const exportResolutions: ExportResolution[] = ["source", "720p", "1080p", "1440p"];

/** Modal for picking the export resolution/format and kicking off the export. */
export function ExportDialog(props: {
  exportFormat: ExportVideoFormat;
  exportResolution: ExportResolution;
  exportSubtitleMode: ExportSubtitleMode;
  exporting: boolean;
  exportProgress: ExportProgress | null;
  hasSubtitles: boolean;
  onClose: () => void;
  onCancelExport: () => void;
  onExport: () => void;
  onFormatChange: (format: ExportVideoFormat) => void;
  onResolutionChange: (resolution: ExportResolution) => void;
  onSubtitleModeChange: (mode: ExportSubtitleMode) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/50 backdrop-blur-[10px]"
      role="presentation"
    >
      <section
        className="grid w-[min(94vw,620px)] gap-4 rounded-2xl border border-white/10 bg-[#161618] p-5 text-white shadow-[0_28px_90px_rgb(0_0_0_/_0.62)]"
        role="dialog"
        aria-modal="true"
        aria-label="Export video"
      >
        <div className="flex items-center justify-between gap-3">
          <strong>Export video</strong>
          <button
            className="inline-flex min-h-[2.15rem] items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] px-3 text-white disabled:cursor-not-allowed disabled:opacity-55"
            type="button"
            onClick={props.onClose}
            disabled={props.exporting}
          >
            <X size={16} />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
          <label className="grid gap-1 text-xs font-extrabold text-slate-400">
            <span>Resolution</span>
            <select
              className="themed-select h-10"
              value={props.exportResolution}
              onChange={(event) =>
                props.onResolutionChange(event.target.value as ExportResolution)
              }
              disabled={props.exporting}
            >
              {exportResolutions.map((resolution) => (
                <option key={resolution} value={resolution}>
                  {resolution === "source" ? "Source" : resolution}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-extrabold text-slate-400">
            <span>Format</span>
            <select
              className="themed-select h-10"
              value={props.exportFormat}
              onChange={(event) => props.onFormatChange(event.target.value as ExportVideoFormat)}
              disabled={props.exporting}
            >
              {exportFormats.map((format) => (
                <option key={format} value={format}>
                  {format.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          {props.hasSubtitles ? (
            <label className="grid gap-1 text-xs font-extrabold text-slate-400 min-[420px]:col-span-2">
              <span>Subtitles</span>
              <select className="themed-select h-10" value={props.exportSubtitleMode} onChange={(event) => props.onSubtitleModeChange(event.target.value as ExportSubtitleMode)} disabled={props.exporting}>
                <option value="burn-in">Burn into video</option>
                <option value="sidecar">Separate .srt file</option>
                <option value="none">Do not export</option>
              </select>
            </label>
          ) : null}
        </div>
        {props.exporting ? (
          <div className="grid gap-2 text-xs font-bold text-slate-300" aria-live="polite">
            <div className="flex items-center justify-between gap-3">
              <span>{props.exportProgress?.message ?? "Preparing export…"}</span>
              <span>{Math.round(props.exportProgress?.percent ?? 0)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-white transition-[width] duration-200"
                style={{ width: `${props.exportProgress?.percent ?? 0}%` }}
              />
            </div>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <button
            className="inline-flex min-h-[2.15rem] items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] px-3 text-white disabled:cursor-not-allowed disabled:opacity-55"
            type="button"
            onClick={props.exporting ? props.onCancelExport : props.onClose}
          >
            {props.exporting ? "Cancel export" : "Cancel"}
          </button>
          <button
            className="inline-flex min-h-[2.15rem] items-center justify-center gap-2 rounded-lg bg-white px-3 font-extrabold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-55"
            type="button"
            onClick={props.onExport}
            disabled={props.exporting}
          >
            <Download size={15} />
            {props.exporting ? "Exporting" : "Export"}
          </button>
        </div>
      </section>
    </div>
  );
}
