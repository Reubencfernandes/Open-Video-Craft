/**
 * Just enough TrueType parsing to measure a string.
 *
 * FFmpeg's drawtext never wraps: it draws whatever it is given on one line,
 * however far past the frame edge that runs. The editor wraps overlay text with
 * CSS, so matching it means deciding the line breaks ourselves, and deciding
 * them means knowing how wide each glyph is in the font that will be used.
 *
 * Only the tables a width calculation needs are read -- `head` for the em size,
 * `hhea`/`hmtx` for advance widths, `cmap` for character-to-glyph lookup. No
 * shaping, no ligatures, and no kerning: Inter keeps its kerning in GPOS, so
 * measurements run a little wide and text wraps marginally early rather than
 * overflowing the frame.
 */
import { readFileSync } from "node:fs";

export interface FontMetrics {
  unitsPerEm: number;
  /** Distance from one baseline to the next, in font units. */
  lineHeight: number;
  advanceByCodePoint: Map<number, number>;
  fallbackAdvance: number;
}

const metricsCache = new Map<string, FontMetrics | null>();

/** Parse a font file, or null if it cannot be read. Results are cached. */
export function loadFontMetrics(filePath: string): FontMetrics | null {
  const cached = metricsCache.get(filePath);
  if (cached !== undefined) {
    return cached;
  }

  let metrics: FontMetrics | null = null;
  try {
    metrics = parseFontMetrics(readFileSync(filePath));
  } catch {
    metrics = null;
  }
  metricsCache.set(filePath, metrics);
  return metrics;
}

export function parseFontMetrics(font: Buffer): FontMetrics | null {
  if (font.length < 12) return null;
  const tables = readTableDirectory(font);
  const head = tables.get("head");
  const hhea = tables.get("hhea");
  const hmtx = tables.get("hmtx");
  const cmap = tables.get("cmap");
  if (!head || !hhea || !hmtx || !cmap) return null;

  const unitsPerEm = font.readUInt16BE(head.offset + 18);
  if (!unitsPerEm) return null;

  // hhea ascender is positive, descender negative; their span plus the line gap
  // is the font's natural baseline-to-baseline distance.
  const ascender = font.readInt16BE(hhea.offset + 4);
  const descender = font.readInt16BE(hhea.offset + 6);
  const lineGap = font.readInt16BE(hhea.offset + 8);
  const numberOfHMetrics = font.readUInt16BE(hhea.offset + 34);
  if (!numberOfHMetrics) return null;

  const advanceByGlyph: number[] = [];
  for (let index = 0; index < numberOfHMetrics; index += 1) {
    const entry = hmtx.offset + index * 4;
    if (entry + 2 > font.length) break;
    advanceByGlyph.push(font.readUInt16BE(entry));
  }
  if (advanceByGlyph.length === 0) return null;

  // Glyphs past numberOfHMetrics all reuse the final advance, per the spec.
  const fallbackAdvance = advanceByGlyph[advanceByGlyph.length - 1];
  const glyphByCodePoint = readCharacterMap(font, cmap.offset);
  const advanceByCodePoint = new Map<number, number>();
  for (const [codePoint, glyphId] of glyphByCodePoint) {
    advanceByCodePoint.set(codePoint, advanceByGlyph[glyphId] ?? fallbackAdvance);
  }

  return {
    unitsPerEm,
    lineHeight: ascender - descender + lineGap,
    advanceByCodePoint,
    fallbackAdvance
  };
}

/** Rendered width of a single line, in pixels, at the given font size. */
export function measureTextWidth(
  text: string,
  fontSize: number,
  metrics: FontMetrics
): number {
  let units = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    units += metrics.advanceByCodePoint.get(codePoint) ?? metrics.fallbackAdvance;
  }
  return units * fontSize / metrics.unitsPerEm;
}

/**
 * Greedy word wrap, matching how the preview's `whitespace-pre-wrap` behaves:
 * explicit newlines are kept, and a single word wider than the limit overflows
 * on its own line instead of being split mid-word.
 */
export function wrapTextToWidth(
  text: string,
  maxWidth: number,
  fontSize: number,
  metrics: FontMetrics
): string {
  if (maxWidth <= 0) return text;

  return text
    .split(/\r?\n/)
    .map((paragraph) => wrapParagraph(paragraph, maxWidth, fontSize, metrics))
    .join("\n");
}

function wrapParagraph(
  paragraph: string,
  maxWidth: number,
  fontSize: number,
  metrics: FontMetrics
): string {
  const words = paragraph.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || measureTextWidth(candidate, fontSize, metrics) <= maxWidth) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);

  return lines.length > 0 ? lines.join("\n") : paragraph;
}

function readTableDirectory(font: Buffer): Map<string, { offset: number; length: number }> {
  const tables = new Map<string, { offset: number; length: number }>();
  const numTables = font.readUInt16BE(4);

  for (let index = 0; index < numTables; index += 1) {
    const record = 12 + index * 16;
    if (record + 16 > font.length) break;
    tables.set(font.toString("ascii", record, record + 4), {
      offset: font.readUInt32BE(record + 8),
      length: font.readUInt32BE(record + 12)
    });
  }

  return tables;
}

/**
 * Pick the best Unicode subtable and read it. Format 12 is preferred because it
 * covers code points above the BMP; format 4 covers the rest.
 */
function readCharacterMap(font: Buffer, cmapOffset: number): Map<number, number> {
  const numberOfSubtables = font.readUInt16BE(cmapOffset + 2);
  let bestOffset: number | null = null;
  let bestFormat = -1;

  for (let index = 0; index < numberOfSubtables; index += 1) {
    const record = cmapOffset + 4 + index * 8;
    if (record + 8 > font.length) break;
    const platformId = font.readUInt16BE(record);
    const encodingId = font.readUInt16BE(record + 2);
    const subtableOffset = cmapOffset + font.readUInt32BE(record + 4);
    if (subtableOffset + 2 > font.length) continue;

    const isUnicode =
      platformId === 0 || (platformId === 3 && (encodingId === 1 || encodingId === 10));
    if (!isUnicode) continue;

    const format = font.readUInt16BE(subtableOffset);
    if ((format === 12 || format === 4) && format > bestFormat) {
      bestFormat = format;
      bestOffset = subtableOffset;
    }
  }

  if (bestOffset === null) return new Map();
  return bestFormat === 12
    ? readFormat12(font, bestOffset)
    : readFormat4(font, bestOffset);
}

function readFormat4(font: Buffer, offset: number): Map<number, number> {
  const glyphByCodePoint = new Map<number, number>();
  const segCountX2 = font.readUInt16BE(offset + 6);
  const segCount = segCountX2 / 2;
  const endCodes = offset + 14;
  const startCodes = endCodes + segCountX2 + 2;
  const idDeltas = startCodes + segCountX2;
  const idRangeOffsets = idDeltas + segCountX2;

  for (let segment = 0; segment < segCount; segment += 1) {
    const end = font.readUInt16BE(endCodes + segment * 2);
    const start = font.readUInt16BE(startCodes + segment * 2);
    if (start > end || start === 0xffff) continue;
    const delta = font.readInt16BE(idDeltas + segment * 2);
    const rangeOffsetPosition = idRangeOffsets + segment * 2;
    const rangeOffset = font.readUInt16BE(rangeOffsetPosition);

    for (let codePoint = start; codePoint <= end; codePoint += 1) {
      let glyphId: number;
      if (rangeOffset === 0) {
        glyphId = (codePoint + delta) & 0xffff;
      } else {
        const glyphPosition =
          rangeOffsetPosition + rangeOffset + (codePoint - start) * 2;
        if (glyphPosition + 2 > font.length) continue;
        const rawGlyph = font.readUInt16BE(glyphPosition);
        if (rawGlyph === 0) continue;
        glyphId = (rawGlyph + delta) & 0xffff;
      }
      if (glyphId !== 0) glyphByCodePoint.set(codePoint, glyphId);
    }
  }

  return glyphByCodePoint;
}

function readFormat12(font: Buffer, offset: number): Map<number, number> {
  const glyphByCodePoint = new Map<number, number>();
  const numberOfGroups = font.readUInt32BE(offset + 12);

  for (let group = 0; group < numberOfGroups; group += 1) {
    const record = offset + 16 + group * 12;
    if (record + 12 > font.length) break;
    const start = font.readUInt32BE(record);
    const end = font.readUInt32BE(record + 4);
    const startGlyph = font.readUInt32BE(record + 8);
    // Guard against a corrupt group claiming a huge range.
    if (end < start || end - start > 0x10000) continue;

    for (let codePoint = start; codePoint <= end; codePoint += 1) {
      glyphByCodePoint.set(codePoint, startGlyph + (codePoint - start));
    }
  }

  return glyphByCodePoint;
}
