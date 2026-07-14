/** Pure HTTP byte-range parsing used by the local media protocol. */
export type ParsedByteRange =
  | { start: number; end: number }
  | "unsatisfiable"
  | null;

export function parseByteRange(rangeHeader: string | null, fileSize: number): ParsedByteRange {
  if (!rangeHeader) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || fileSize <= 0 || (!match[1] && !match[2])) {
    return "unsatisfiable";
  }

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return "unsatisfiable";
    }
    return {
      start: Math.max(0, fileSize - suffixLength),
      end: fileSize - 1
    };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : fileSize - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= fileSize ||
    requestedEnd < start
  ) {
    return "unsatisfiable";
  }

  return { start, end: Math.min(requestedEnd, fileSize - 1) };
}
