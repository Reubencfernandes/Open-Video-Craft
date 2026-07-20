/** Centered release-notes dialog opened from the homepage footer. */
import { Check, X } from "lucide-react";
import { latestRelease } from "./latest-release";

export function ChangelogDialog(props: { open: boolean; onClose: () => void }) {
  if (!props.open) return null;

  return (
    <div
      className="fixed inset-0 z-[65] grid place-items-center bg-black/70 p-4 backdrop-blur-md"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) props.onClose();
      }}
    >
      <section
        className="relative flex max-h-[calc(100dvh-2rem)] w-[min(35rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[1.65rem] bg-[#101012] text-white shadow-[0_32px_100px_rgb(0_0_0_/_0.72)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-title"
        data-changelog-card
      >
        <div
          className="relative h-36 shrink-0 overflow-hidden bg-[#18181b] bg-cover bg-center"
          data-changelog-hero
          data-has-image={latestRelease.heroImageUrl ? "true" : "false"}
          style={latestRelease.heroImageUrl
            ? { backgroundImage: `url(${JSON.stringify(latestRelease.heroImageUrl)})` }
            : undefined}
        >
          <button
            className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg bg-black/25 text-white/75 backdrop-blur-sm transition hover:bg-black/45 hover:text-white"
            type="button"
            aria-label="Close changelog"
            onClick={props.onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-7">
          <header className="mx-auto max-w-md text-center">
            <span className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[#ff6ba5]">
              Open Video Craft {latestRelease.version}
            </span>
            <h2 id="changelog-title" className="m-0 mt-2 text-xl font-semibold tracking-[-0.02em]">
              {latestRelease.title}
            </h2>
            <p className="m-0 mt-1.5 text-xs text-neutral-500">Released {latestRelease.releasedAt}</p>
          </header>

          <article className="mt-5 rounded-2xl bg-[#18181b] p-4 shadow-[0_12px_35px_rgb(0_0_0_/_0.22)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="m-0 text-sm font-semibold text-white">Open Video Craft</h3>
                <p className="m-0 mt-0.5 text-[0.68rem] text-neutral-500">Desktop video creation suite</p>
              </div>
              <span className="shrink-0 rounded-full bg-white/[0.06] px-2.5 py-1 text-[0.6rem] font-semibold text-neutral-400">
                Release notes
              </span>
            </div>

            <div className="mt-4">
              <h4 className="m-0 text-xs font-semibold text-neutral-200">About this update</h4>
              <p className="m-0 mt-1.5 text-xs leading-5 text-neutral-400">{latestRelease.summary}</p>
            </div>

            <div className="mt-4">
              <h4 className="m-0 text-xs font-semibold text-neutral-200">What changed</h4>
              <ul className="m-0 mt-2 grid list-none gap-2.5 p-0">
                {latestRelease.changes.map((change) => (
                  <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5 text-xs leading-5 text-neutral-400" key={change}>
                    <span className="mt-1 grid size-4 place-items-center rounded-full bg-[#ff4b93]/10 text-[#ff6ba5]">
                      <Check size={10} strokeWidth={2.6} />
                    </span>
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
            </div>

          </article>
        </div>

        <footer className="shrink-0 px-5 pb-5 sm:px-7">
          <button
            className="min-h-10 w-full rounded-xl bg-white text-sm font-semibold text-black transition hover:bg-neutral-200 active:scale-[0.99]"
            type="button"
            onClick={props.onClose}
          >
            Got it
          </button>
        </footer>
      </section>
    </div>
  );
}
