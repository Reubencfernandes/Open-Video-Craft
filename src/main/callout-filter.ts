import type { TimelineCompositionTextOverlay } from "./ffmpeg";
import { loadFontMetrics, measureTextWidth, wrapTextToWidth } from "./font-metrics";
import { resolveOverlayFont } from "./overlay-fonts";

export interface CalloutLayout {
  titleText: string;
  bodyText: string;
  titleFontSize: number;
  bodyFontSize: number;
  titleLineSpacing: number;
  bodyLineSpacing: number;
  boxWidth: number;
  boxHeight: number;
  x: number;
  y: number;
  titleY: number;
  bodyY: number;
}

/** Compute callout geometry from the same font metrics used by drawtext. */
export function createCalloutLayout(
  overlay: TimelineCompositionTextOverlay,
  height: number,
  width: number
): CalloutLayout {
  const box = overlay.box;
  const scale = height / 1080;
  const bodyFontSize = Math.max(12, Math.round(overlay.size * scale));
  const titleFontSize = Math.max(10, Math.round((box?.titleSize ?? overlay.size * 0.6) * scale));
  const padding = Math.round((box?.padding ?? 16) * scale);
  const border = Math.round((box?.borderWidth ?? 0) * scale);
  const font = resolveOverlayFont(overlay);
  const metrics = font.filePath ? loadFontMetrics(font.filePath) : null;
  const maxTextWidth = Math.max(80, Math.floor(width * 0.78));
  const titleText = overlay.title ? overlay.title.toLocaleUpperCase() : "";
  const bodyText = overlay.text || "";
  const titleLines = metrics && titleText
    ? wrapTextToWidth(titleText, maxTextWidth, titleFontSize, metrics)
    : titleText;
  const bodyLines = metrics && bodyText
    ? wrapTextToWidth(bodyText, maxTextWidth, bodyFontSize, metrics)
    : bodyText;
  const titleLineCount = titleLines ? titleLines.split("\n").length : 0;
  const bodyLineCount = bodyLines ? bodyLines.split("\n").length : 0;
  const natural = metrics ? metrics.lineHeight / metrics.unitsPerEm : 1.2;
  const titleSpacing = Math.max(0, Math.round((1.25 - natural) * titleFontSize));
  const bodySpacing = Math.max(0, Math.round((1.25 - natural) * bodyFontSize));
  const titleWidth = metrics && titleLines
    ? Math.max(...titleLines.split("\n").map((line) => measureTextWidth(line, titleFontSize, metrics)))
    : 0;
  const bodyWidth = metrics && bodyLines
    ? Math.max(...bodyLines.split("\n").map((line) => measureTextWidth(line, bodyFontSize, metrics)))
    : 0;
  const contentWidth = Math.min(maxTextWidth, Math.max(titleWidth, bodyWidth));
  const boxWidth = Math.max(80, Math.min(width - 16, Math.round(contentWidth + (padding + border) * 2 + 8)));
  const titleHeight = titleLineCount * titleFontSize + Math.max(0, titleLineCount - 1) * titleSpacing;
  const bodyHeight = bodyLineCount * bodyFontSize + Math.max(0, bodyLineCount - 1) * bodySpacing;
  const gap = titleLineCount && bodyLineCount ? Math.round(6 * scale) : 0;
  const boxHeight = Math.max(
    40,
    Math.min(height - 16, Math.round(titleHeight + gap + bodyHeight + (padding + border) * 2 + 8))
  );
  const x = Math.round(overlay.x / 100 * width - boxWidth / 2);
  const y = Math.round(overlay.y / 100 * height - boxHeight / 2);
  const titleY = Math.round(y + padding + border);
  const bodyY = Math.round(titleY + titleHeight + gap);
  return {
    titleText, bodyText, titleFontSize, bodyFontSize,
    titleLineSpacing: titleSpacing, bodyLineSpacing: bodySpacing,
    boxWidth, boxHeight, x, y, titleY, bodyY
  };
}

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
  const layout = createCalloutLayout(overlay, height, width);

  const id = (overlay.id ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || "callout";
  const background = hexToRgb(box.backgroundColor);
  const border = hexToRgb(box.borderColor);
  const boxWidth = layout.boxWidth;
  const boxHeight = layout.boxHeight;
  const x = layout.x;
  const y = layout.y;
  const radius = Math.min(box.borderRadius, boxWidth / 2, boxHeight / 2);
  const innerInset = Math.min(box.borderWidth, boxWidth / 2 - 1, boxHeight / 2 - 1);
  let boxLabel: string;
  if (innerInset <= 0) {
    const panel = roundedRgbFilter(
      `${id}Background`, boxWidth, boxHeight, radius, background,
      box.backgroundOpacity / 100, overlay.start, overlay.end
    );
    filters.push(...panel.lines);
    boxLabel = panel.label;
  } else {
    const outer = roundedRgbFilter(
      `${id}Border`, boxWidth, boxHeight, radius, border, 1, overlay.start, overlay.end
    );
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
    boxLabel = `${id}Box`;
    filters.push(`[${outer.label}][${inner.label}]overlay=${innerInset}:${innerInset}[${boxLabel}]`);
  }
  filters.push(
    `[${inputLabel}][${boxLabel}]overlay=x=${num(x)}:y=${num(y)}:enable='between(t,${num(overlay.start)},${num(overlay.end)})'[${id}Panel]`
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
  const layout = createCalloutLayout(overlay, height, width);
  const boxWidth = layout.boxWidth;
  const boxHeight = layout.boxHeight;
  const x = `(${num(overlay.x)}*w/${num(100)}-${num(boxWidth)}/2)`;
  const y = `(${num(overlay.y)}*h/${num(100)}-${num(boxHeight)}/2)`;
  const start = num(overlay.start);
  const end = num(overlay.end);
  const background = `0x${box.backgroundColor.slice(1)}@${num(box.backgroundOpacity / 100)}`;
  const border = `0x${box.borderColor.slice(1)}@1`;
  if (box.borderWidth <= 0) {
    return `drawbox=x='${x}':y='${y}':w=${boxWidth}:h=${boxHeight}:color='${background}':t='fill':enable='between(t,${start},${end})'`;
  }
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
