/** Distinct decoded frames spread across a video timeline clip. */
export function VideoFilmstrip({ frames }: { frames: string[] }) {
  if (frames.length === 0) return null;

  return (
    <span className="pointer-events-none absolute inset-0 z-0 flex overflow-hidden" aria-hidden="true">
      {frames.map((frame, index) => (
        <img
          className="h-full min-w-0 flex-1 border-r border-black/30 object-cover last:border-r-0"
          src={frame}
          alt=""
          key={`${index}-${frame.slice(-18)}`}
        />
      ))}
      <span className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/10 to-black/35" />
    </span>
  );
}
