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
    <div className="export-dialog-backdrop" role="presentation">
      <section className="export-dialog" role="dialog" aria-modal="true" aria-label="Export video">
        <div className="export-dialog-header">
          <strong>Export video</strong>
          <button type="button" onClick={props.onClose} disabled={props.exporting}>
            <X size={16} />
          </button>
        </div>
        <label>
          <span>Resolution</span>
          <select
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
        <label>
          <span>Format</span>
          <select
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
        <div className="export-dialog-actions">
          <button type="button" onClick={props.onClose} disabled={props.exporting}>
            Cancel
          </button>
          <button type="button" onClick={props.onExport} disabled={props.exporting}>
            <Download size={15} />
            {props.exporting ? "Exporting" : "Export"}
          </button>
        </div>
      </section>
    </div>
  );
}
