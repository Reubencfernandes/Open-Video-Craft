/**
 * Layout tool: layout mode, screen scale/aspect, and camera shape/size/
 * position/crop controls.
 */
import { RangeControl } from "../controls";
import type {
  CameraBorderStyle,
  CameraContentTransform,
  CameraPosition,
  CameraShape,
  LayoutMode,
  ScreenAspectRatio
} from "../types";
import { CameraCropControls } from "./CameraCropControls";

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

const screenAspectOptions: ScreenAspectRatio[] = ["16:9", "16:10", "4:3"];

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
  screenAspectRatio: ScreenAspectRatio;
  screenAspectEnabled: boolean;
  cameraShape: CameraShape;
  cameraBorderStyle: CameraBorderStyle;
  cameraContentTransform: CameraContentTransform;
  cameraPosition: CameraPosition;
  cameraSize: number;
  onLayoutModeChange: (mode: LayoutMode) => void;
  onScreenScaleChange: (scale: number) => void;
  onScreenAspectRatioChange: (aspectRatio: ScreenAspectRatio) => void;
  onCameraShapeChange: (shape: CameraShape) => void;
  onCameraBorderStyleChange: (border: CameraBorderStyle) => void;
  onCameraContentTransformChange: (patch: Partial<CameraContentTransform>) => void;
  onCameraContentTransformReset: () => void;
  onCameraPositionChange: (position: CameraPosition) => void;
  onCameraSizeChange: (size: number) => void;
}) {
  return (
    <div className="grid min-h-0 content-start gap-4 overflow-auto">
      <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
        Presets
      </div>

      <div className="grid gap-4">
        {layoutPresetGroups.map((group) => (
          <section className="grid gap-2" key={group.title}>
            <h3 className="m-0 text-xs font-extrabold text-slate-400">{group.title}</h3>
            <div className="grid grid-cols-2 gap-2">
              {group.presets.map((preset) => (
                <button
                  className={`grid min-h-[5.2rem] gap-2 rounded-lg border p-2 text-left text-xs font-extrabold ${
                    props.layoutMode === preset.id
                      ? "border-white bg-white/[0.1] text-white"
                      : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.07]"
                  }`}
                  type="button"
                  key={`${group.title}-${preset.variant}`}
                  aria-label={preset.label}
                  onClick={() => props.onLayoutModeChange(preset.id)}
                >
                  <span className="relative block aspect-video overflow-hidden rounded-md bg-slate-950">
                    <i className="absolute inset-[18%_14%] rounded-sm bg-slate-300/80" />
                    {preset.id !== "screen-only" ? (
                      <b
                        className={`absolute rounded-full bg-white ${
                          preset.id === "camera-only"
                            ? "inset-[22%] rounded-md"
                            : preset.id === "presenter"
                              ? "bottom-[16%] right-[12%] size-[36%]"
                              : "bottom-[12%] right-[10%] size-[28%]"
                        }`}
                      />
                    ) : null}
                  </span>
                  <strong>{preset.label}</strong>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="grid gap-4">
        {props.layoutMode !== "camera-only" ? (
          <>
            <RangeControl
              label="Screen size"
              min={70}
              max={150}
              value={props.screenScale}
              suffix="%"
              onChange={props.onScreenScaleChange}
            />
            {props.screenAspectEnabled ? (
              <div className="grid gap-2">
                <span className="text-xs font-extrabold text-slate-400">Screen ratio</span>
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-white/[0.05] p-1">
                  {screenAspectOptions.map((aspectRatio) => (
                    <button
                      className={`rounded-md px-2 py-2 text-xs font-extrabold ${
                        props.screenAspectRatio === aspectRatio
                          ? "bg-white text-[#111827]"
                          : "text-slate-300 hover:bg-white/10 hover:text-white"
                      }`}
                      type="button"
                      key={aspectRatio}
                      onClick={() => props.onScreenAspectRatioChange(aspectRatio)}
                    >
                      {aspectRatio}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        <div className="grid gap-2">
          <span className="text-xs font-extrabold text-slate-400">Camera style</span>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-white/[0.05] p-1">
            {(["circle", "rounded", "square"] as CameraShape[]).map((shape) => (
              <button
                className={`grid h-10 place-items-center rounded-md ${
                  props.cameraShape === shape
                    ? "bg-white text-[#111827]"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
                type="button"
                key={shape}
                onClick={() => props.onCameraShapeChange(shape)}
                title={shape}
              >
                <i
                  className={`block size-5 border-2 border-current ${
                    shape === "circle" ? "rounded-full" : shape === "rounded" ? "rounded-md" : ""
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <span className="text-xs font-extrabold text-slate-400">Camera border</span>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-white/[0.05] p-1">
            {(["none", "light", "accent"] as CameraBorderStyle[]).map((border) => (
              <button
                className={`rounded-md px-2 py-2 text-xs font-extrabold ${
                  props.cameraBorderStyle === border
                    ? "bg-white text-[#111827]"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
                type="button"
                key={border}
                onClick={() => props.onCameraBorderStyleChange(border)}
              >
                {border}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <span className="text-xs font-extrabold text-slate-400">Position</span>
            <div className="grid aspect-square grid-cols-3 gap-1 rounded-lg bg-white/[0.05] p-1">
              {cameraPositionOptions.map((position) => (
                <button
                  className={`rounded-md ${
                    props.cameraPosition === position
                      ? "bg-white"
                      : "bg-white/10 hover:bg-white/20"
                  }`}
                  type="button"
                  key={position}
                  onClick={() => props.onCameraPositionChange(position)}
                  title={position.replace("-", " ")}
                />
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <span className="text-xs font-extrabold text-slate-400">Camera size</span>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-white/[0.05] p-1">
              {cameraSizeOptions.map((option) => (
                <button
                  className={`rounded-md px-2 py-2 text-xs font-extrabold ${
                    props.cameraSize === option.value
                      ? "bg-white text-[#111827]"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
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

        <CameraCropControls
          transform={props.cameraContentTransform}
          onChange={props.onCameraContentTransformChange}
          onReset={props.onCameraContentTransformReset}
        />
      </div>
    </div>
  );
}
