import { ChevronDown, Pipette } from "lucide-react";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

type HsbColor = {
  hue: number;
  saturation: number;
  brightness: number;
};

export function TextColorPicker(props: {
  color: string;
  opacity: number;
  onColorChange: (color: string) => void;
  onOpacityChange: (opacity: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const hsb = useMemo(() => hexToHsb(props.color), [props.color]);
  const trackStyle = {
    "--text-picker-color": props.color
  } as CSSProperties;

  return (
    <div className="grid min-w-0 gap-2">
      <span className="text-[0.68rem] font-semibold text-slate-400">Color</span>
      <button
        className={`editor-field flex h-10 min-w-0 items-center gap-2.5 px-3 text-left ${
          open ? "editor-field-active" : ""
        }`}
        type="button"
        aria-expanded={open}
        aria-controls="text-color-picker-controls"
        onClick={() => setOpen((current) => !current)}
      >
        <span
          className="size-5 shrink-0 rounded-md border border-white/25 shadow-[0_2px_8px_rgb(0_0_0_/_0.3)]"
          style={{ backgroundColor: props.color, opacity: props.opacity / 100 }}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-xs uppercase text-white">
          {props.color}
        </span>
        <span className="text-[0.62rem] tabular-nums text-neutral-500">{Math.round(props.opacity)}%</span>
        <ChevronDown
          className={`shrink-0 text-neutral-500 transition-transform duration-200 ${open ? "rotate-180 text-neutral-200" : ""}`}
          size={15}
        />
      </button>

      <div
        className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
        aria-hidden={!open}
      >
        <div className="min-h-0">
          <div
            className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-3 rounded-xl border border-white/[0.08] bg-[#202023] p-3 shadow-[0_16px_32px_rgb(0_0_0_/_0.28)]"
            id="text-color-picker-controls"
          >
            <label
              className="relative row-span-2 grid size-8 cursor-pointer place-items-center self-center rounded-lg bg-white/[0.055] text-neutral-300 transition hover:bg-white/10 hover:text-white focus-within:ring-2 focus-within:ring-[#ff4b73]/75"
              title="Open system color picker"
            >
              <Pipette size={16} />
              <input
                className="absolute inset-0 cursor-pointer opacity-0"
                type="color"
                aria-label="Choose text color"
                value={props.color}
                onChange={(event) => props.onColorChange(event.target.value)}
              />
            </label>

            <input
              className="text-color-hue-slider"
              type="range"
              aria-label="Text hue"
              min={0}
              max={360}
              step={1}
              value={Math.round(hsb.hue)}
              onChange={(event) => {
                props.onColorChange(hsbToHex({
                  ...hsb,
                  hue: Number(event.target.value),
                  saturation: hsb.saturation < 1 ? 75 : hsb.saturation,
                  brightness: hsb.brightness < 1 ? 90 : hsb.brightness
                }));
              }}
            />

            <input
              className="text-color-opacity-slider"
              type="range"
              aria-label="Text opacity"
              min={0}
              max={100}
              step={1}
              value={props.opacity}
              style={trackStyle}
              onChange={(event) => props.onOpacityChange(Number(event.target.value))}
            />

            <div className="col-span-2 grid grid-cols-[auto_repeat(4,minmax(0,1fr))] items-center gap-2 border-t border-white/[0.07] pt-2 text-[0.65rem] tabular-nums">
              <span className="font-semibold text-neutral-300">HSB</span>
              <ColorMetric label="H" value={Math.round(hsb.hue)} />
              <ColorMetric label="S" value={Math.round(hsb.saturation)} />
              <ColorMetric label="B" value={Math.round(hsb.brightness)} />
              <ColorMetric label="A" value={Math.round(props.opacity)} suffix="%" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorMetric(props: { label: string; value: number; suffix?: string }) {
  return (
    <span className="grid justify-items-center gap-0.5 text-neutral-100">
      <span>{props.value}{props.suffix}</span>
      <span className="text-[0.52rem] font-bold text-neutral-600">{props.label}</span>
    </span>
  );
}

export function hexToHsb(hex: string): HsbColor {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "ffffff";
  const red = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const green = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;

  if (delta > 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }

  return {
    hue: hue < 0 ? hue + 360 : hue,
    saturation: maximum === 0 ? 0 : delta / maximum * 100,
    brightness: maximum * 100
  };
}

export function hsbToHex(color: HsbColor): string {
  const hue = ((color.hue % 360) + 360) % 360;
  const saturation = Math.max(0, Math.min(100, color.saturation)) / 100;
  const brightness = Math.max(0, Math.min(100, color.brightness)) / 100;
  const chroma = brightness * saturation;
  const intermediate = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const offset = brightness - chroma;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (hue < 60) [red, green, blue] = [chroma, intermediate, 0];
  else if (hue < 120) [red, green, blue] = [intermediate, chroma, 0];
  else if (hue < 180) [red, green, blue] = [0, chroma, intermediate];
  else if (hue < 240) [red, green, blue] = [0, intermediate, chroma];
  else if (hue < 300) [red, green, blue] = [intermediate, 0, chroma];
  else [red, green, blue] = [chroma, 0, intermediate];

  return `#${[red, green, blue]
    .map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}
