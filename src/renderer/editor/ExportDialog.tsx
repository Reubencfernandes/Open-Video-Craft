/**
 * Export modal: format and resolution selection.
 */
import { Download, X } from "lucide-react";
import type { ExportResolution, ExportVideoFormat } from "../../shared/types";

const exportFormats: ExportVideoFormat[] = ["mp4", "webm", "mov"];
const exportResolutions: ExportResolution[] = ["source", "720p", "1080p", "1440p"];

/** Modal for picking the export resolution/format and kicking off the export. */
export function ExportDialog(props: {
  exportFormat: ExportVideoFormat;
  exportResolution: ExportResolution;
  exporting: boolean;
  onClose: () => void;
  onExport: () => void;
  onFormatChange: (format: ExportVideoFormat) => void;
  onResolutionChange: (resolution: ExportResolution) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-20 grid place-items-center bg-black/50 backdrop-blur-[10px]"
      role="presentation"
    >
      <section
        className="grid w-[min(92vw,360px)] gap-4 rounded-lg border border-white/10 bg-[#121720] p-4 text-white shadow-[0_24px_80px_rgb(0_0_0_/_0.52)]"
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
        <label className="grid gap-1 text-xs font-extrabold text-slate-400">
          <span>Resolution</span>
          <select
            className="h-10 rounded-lg border border-white/10 bg-black/20 px-3 text-white"
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
            className="h-10 rounded-lg border border-white/10 bg-black/20 px-3 text-white"
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
        <div className="flex items-center justify-between gap-3">
          <button
            className="inline-flex min-h-[2.15rem] items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] px-3 text-white disabled:cursor-not-allowed disabled:opacity-55"
            type="button"
            onClick={props.onClose}
            disabled={props.exporting}
          >
            Cancel
          </button>
          <button
            className="inline-flex min-h-[2.15rem] items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#e7f7ff] px-3 font-extrabold text-[#071018] disabled:cursor-not-allowed disabled:opacity-55"
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
