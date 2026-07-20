const pixelGlyphs: Record<string, readonly string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  ":": ["000", "010", "000", "010", "000"]
};

export function PixelTimer(props: { value: string }) {
  return (
    <div
      className="inline-flex items-center gap-1.5"
      role="timer"
      aria-label={`Recording time ${props.value}`}
      data-pixel-timer
    >
      {Array.from(props.value).map((character, characterIndex) => {
        const glyph = pixelGlyphs[character] ?? pixelGlyphs["0"];

        return (
          <span
            aria-hidden="true"
            className="grid grid-cols-3 gap-[3px]"
            key={`${characterIndex}-${character}`}
          >
            {glyph.flatMap((row) => Array.from(row)).map((pixel, pixelIndex) => (
              <span
                className={
                  pixel === "1"
                    ? "size-[6px] bg-white shadow-[0_0_8px_rgb(255_59_157_/_0.38)]"
                    : "size-[6px] bg-white/[0.035]"
                }
                key={pixelIndex}
              />
            ))}
          </span>
        );
      })}
    </div>
  );
}
