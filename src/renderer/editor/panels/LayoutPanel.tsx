import { RangeControl } from "../controls";
import type { CameraBorderStyle, CameraPosition, CameraShape, LayoutMode } from "../types";

const layoutPresetGroups: Array<{
  title: string;
  presets: Array<{
    id: LayoutMode;
    label: string;
    variant: string;
    featured?: boolean;
  }>;
}> = [
  {
    title: "Screen",
    presets: [
      { id: "screen-only", label: "Screen only", variant: "screen-only" },
      { id: "camera-only", label: "Camera only", variant: "camera-only" }
    ]
  },
  {
    title: "Camera Bubble",
    presets: [
      { id: "bubble", label: "Bubble on fit screen", variant: "bubble-a" },
      { id: "bubble-fill", label: "Bubble on filled screen", variant: "bubble-b", featured: true }
    ]
  },
  {
    title: "Side-by-Side",
    presets: [
      { id: "side-by-side", label: "Split left", variant: "split-a" },
      { id: "side-overlap", label: "Split left overlap", variant: "split-b" }
    ]
  },
  {
    title: "TV Presenter",
    presets: [
      { id: "presenter", label: "TV presenter", variant: "presenter-a", featured: true }
    ]
  }
];

const cameraSizeOptions = [
  { label: "S", value: 18 },
  { label: "M", value: 24 },
  { label: "L", value: 32 }
];

const cameraPositionOptions: CameraPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right"
];

/**
 * "Layout" tool: pick a screen/camera arrangement preset and fine-tune the
 * screen size plus the camera bubble's shape, border, position and size.
 */
export function LayoutPanel(props: {
  layoutMode: LayoutMode;
  screenScale: number;
  cameraShape: CameraShape;
  cameraBorderStyle: CameraBorderStyle;
  cameraPosition: CameraPosition;
  cameraSize: number;
  onLayoutModeChange: (mode: LayoutMode) => void;
  onScreenScaleChange: (scale: number) => void;
  onCameraShapeChange: (shape: CameraShape) => void;
  onCameraBorderStyleChange: (border: CameraBorderStyle) => void;
  onCameraPositionChange: (position: CameraPosition) => void;
  onCameraSizeChange: (size: number) => void;
}) {
  return (
    <div className="layout-panel">
      <div className="layout-panel-title">Presets</div>

      <div className="layout-presets">
        {layoutPresetGroups.map((group) => (
          <section className="layout-preset-group" key={group.title}>
            <h3>{group.title}</h3>
            <div className="layout-preset-grid">
              {group.presets.map((preset) => (
                <button
                  className={`layout-preset-card layout-preset-${preset.variant} ${
                    props.layoutMode === preset.id ? "layout-preset-active" : ""
                  }`}
                  type="button"
                  key={`${group.title}-${preset.variant}`}
                  aria-label={preset.label}
                  onClick={() => props.onLayoutModeChange(preset.id)}
                >
                  <span className="layout-preset-screen">
                    <i />
                    <b />
                  </span>
                  <strong>{preset.label}</strong>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="layout-customization">
        {props.layoutMode !== "camera-only" ? (
          <RangeControl
            label="Screen size"
            min={70}
            max={150}
            value={props.screenScale}
            suffix="%"
            onChange={props.onScreenScaleChange}
          />
        ) : null}

        <div className="layout-control-group">
          <span>Camera style</span>
          <div className="icon-segmented-control">
            {(["circle", "rounded", "square"] as CameraShape[]).map((shape) => (
              <button
                className={props.cameraShape === shape ? "segmented-active" : ""}
                type="button"
                key={shape}
                onClick={() => props.onCameraShapeChange(shape)}
                title={shape}
              >
                <i className={`camera-shape-icon camera-shape-${shape}`} />
              </button>
            ))}
          </div>
        </div>

        <div className="layout-control-group">
          <span>Camera border</span>
          <div className="segmented-control">
            {(["none", "light", "accent"] as CameraBorderStyle[]).map((border) => (
              <button
                className={props.cameraBorderStyle === border ? "segmented-active" : ""}
                type="button"
                key={border}
                onClick={() => props.onCameraBorderStyleChange(border)}
              >
                {border}
              </button>
            ))}
          </div>
        </div>

        <div className="layout-control-grid">
          <div className="layout-control-group">
            <span>Position</span>
            <div className="position-grid">
              {cameraPositionOptions.map((position) => (
                <button
                  className={props.cameraPosition === position ? "position-active" : ""}
                  type="button"
                  key={position}
                  onClick={() => props.onCameraPositionChange(position)}
                  title={position.replace("-", " ")}
                />
              ))}
            </div>
          </div>

          <div className="layout-control-group">
            <span>Camera size</span>
            <div className="segmented-control">
              {cameraSizeOptions.map((option) => (
                <button
                  className={props.cameraSize === option.value ? "segmented-active" : ""}
                  type="button"
                  key={option.label}
                  onClick={() => props.onCameraSizeChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
