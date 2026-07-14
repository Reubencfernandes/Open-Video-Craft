/** Centered release-notes dialog opened from the homepage footer. */
import { CheckCircle2, X } from "lucide-react";
import { latestRelease } from "./latest-release";

export function ChangelogDialog(props: { open: boolean; onClose: () => void }) {
  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[65] grid place-items-center bg-black/65 p-5 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) props.onClose(); }}>
      <section className="relative grid w-[min(34rem,calc(100vw-2rem))] gap-5 rounded-2xl bg-[linear-gradient(145deg,#1b1b21,#101115)] p-6 text-white shadow-[0_30px_90px_rgb(0_0_0_/_0.65)]" role="dialog" aria-modal="true" aria-labelledby="changelog-title">
        <button className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white" type="button" aria-label="Close changelog" onClick={props.onClose}><X size={18} /></button>
        <header><span className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">Version {latestRelease.version}</span><h2 id="changelog-title" className="m-0 mt-2 text-xl font-semibold">{latestRelease.title}</h2><p className="m-0 mt-1 text-sm text-slate-400">Everything included in the latest homepage and editor update.</p></header>
        <ul className="m-0 grid list-none gap-3 p-0">{latestRelease.changes.map((change) => <li className="flex gap-3 text-sm leading-6 text-slate-300" key={change}><CheckCircle2 className="mt-1 shrink-0 text-emerald-300" size={16} /><span>{change}</span></li>)}</ul>
        <button className="ml-auto min-h-10 rounded-lg bg-white/[0.07] px-5 text-sm font-medium hover:bg-white/[0.12]" type="button" onClick={props.onClose}>Done</button>
      </section>
    </div>
  );
}
