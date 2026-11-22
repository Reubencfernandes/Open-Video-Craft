import type { TimelineCompositionTextOverlay } from "./ffmpeg";

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Adds a rounded, alpha-animated callout panel before its text is drawn. */
export function appendCalloutBoxFilter(
  filters: string[],
  inputLabel: string,
  overlay: TimelineCompositionTextOverlay,
  height: number,
  width: number
): string {
  const box = overlay.box;
  if (!box) return inputLabel;

  const id = (overlay.id ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || "callout";
  const background = hexToRgb(box.backgroundColor);
  const border = hexToRgb(box.borderColor);
  const boxWidth = Math.max(80, Math.min(width - 2, Math.round(overlay.size * 8 + box.padding * 2)));
  const boxHeight = Math.max(40, Math.min(height - 2, Math.round(overlay.size * (overlay.title ? 2.4 : 1.6) + box.padding * 2)));
  const x = Math.round(overlay.x / 100 * width - boxWidth / 2);
  const y = Math.round(overlay.y / 100 * height - boxHeight / 2);
  const radius = Math.min(box.borderRadius, boxWidth / 2, boxHeight / 2);
  const outer = roundedRgbFilter(`${id}Border`, boxWidth, boxHeight, radius, border, box.borderWidth > 0 ? 1 : box.backgroundOpacity / 100, overlay.start, overlay.end);
  const innerInset = Math.min(box.borderWidth, boxWidth / 2 - 1, boxHeight / 2 - 1);
  const inner = roundedRgbFilter(
    `${id}Background`,
    boxWidth - innerInset * 2,
    boxHeight - innerInset * 2,
    Math.max(0, radius - innerInset),
    background,
    box.backgroundOpacity / 100,
    overlay.start,
    overlay.end
  );

  filters.push(...outer.lines, ...inner.lines);
  filters.push(
    `[${outer.label}][${inner.label}]overlay=${innerInset}:${innerInset}[${id}Box]`,
    `[${inputLabel}][${id}Box]overlay=x=${num(x)}:y=${num(y)}:enable='between(t,${num(overlay.start)},${num(overlay.end)})'[${id}Panel]`
  );
  return `${id}Panel`;
}

interface RoundedFilter {
  readonly lines: readonly string[];
  readonly label: string;
}

function roundedRgbFilter(
  label: string,
  width: number,
  height: number,
  radius: number,
  color: Rgb,
  opacity: number,
  start: number,
  end: number
): RoundedFilter {
  const duration = Math.max(0.04, end - start);
  const ramp = Math.min(0.4, Math.max(0.05, duration / 2));
  const alpha = `${num(255 * Math.max(0, Math.min(1, opacity)))}*clip(T/${num(ramp)},0,1)*clip((${num(duration)}-T)/${num(ramp)},0,1)`;
  const corner = `pow(max(max(${num(radius)}-X\\,X-(${num(width)}-${num(radius)}))\\,0)\\,2)+pow(max(max(${num(radius)}-Y\\,Y-(${num(height)}-${num(radius)}))\\,0)\\,2)`;
  const mask = `if(lte(${corner}\\,${num(radius * radius)})\\,${alpha}\\,0)`;
  return {
    label,
    lines: [
      `color=c=black:s=${width}x${height}:d=${num(duration)}:r=30,format=rgba,` +
        `geq=r='${color.r}':g='${color.g}':b='${color.b}':a='${mask}',` +
        `setpts=PTS-STARTPTS+${num(start)}/TB[${label}]`
    ]
  };
}

/** Rectangular fallback for the plain `-vf` export path, which cannot add sources. */
export function createCalloutBoxDrawboxFilter(
  overlay: TimelineCompositionTextOverlay,
  height: number,
  width: number
): string {
  if (!overlay.box) return "";
  const box = overlay.box;
  const boxWidth = Math.max(80, Math.min(width - 2, Math.round(overlay.size * 8 + box.padding * 2)));
  const boxHeight = Math.max(40, Math.min(height - 2, Math.round(overlay.size * (overlay.title ? 2.4 : 1.6) + box.padding * 2)));
  const x = `(${num(overlay.x)}*w/${num(100)}-${num(boxWidth)}/2)`;
  const y = `(${num(overlay.y)}*h/${num(100)}-${num(boxHeight)}/2)`;
  const start = num(overlay.start);
  const end = num(overlay.end);
  const background = `0x${box.backgroundColor.slice(1)}@${num(box.backgroundOpacity / 100)}`;
  const border = `0x${box.borderColor.slice(1)}@1`;
  return (
    `drawbox=x='${x}':y='${y}':w=${boxWidth}:h=${boxHeight}:color='${border}':t='fill':enable='between(t,${start},${end})',` +
    `drawbox=x='${x}+${num(box.borderWidth)}':y='${y}+${num(box.borderWidth)}':w=${Math.max(1, boxWidth - box.borderWidth * 2)}:h=${Math.max(1, boxHeight - box.borderWidth * 2)}:color='${background}':t='fill':enable='between(t,${start},${end})'`
  );
}

function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "");
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16)
  };
}


function num(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : "0";
}
