/** Reusable launcher card for one primary create/open workflow. */
import type { ReactNode } from "react";

export function HomeActionCard(props: {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  disabled: boolean;
  onAction: () => void;
}) {
  return (
    <article className="grid min-h-[12.8rem] grid-cols-[3.9rem_minmax(0,1fr)] gap-5 rounded-xl border border-white/[0.07] bg-[linear-gradient(135deg,rgb(255_255_255_/_0.045),rgb(255_255_255_/_0.015))] p-5 shadow-[inset_0_1px_rgb(255_255_255_/_0.025)]">
      <span className="grid size-14 place-items-center rounded-full bg-white/[0.055]">{props.icon}</span>
      <div className="grid min-w-0 content-start gap-2 pt-1">
        <h2 className="m-0 text-xl font-medium tracking-[-0.02em] text-white">{props.title}</h2>
        <p className="m-0 max-w-[18rem] text-sm leading-6 text-slate-400">{props.description}</p>
        <button className="mt-4 inline-flex min-h-11 w-fit min-w-44 items-center justify-center rounded-lg bg-white/[0.055] px-5 text-sm font-medium text-slate-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-45" type="button" disabled={props.disabled} onClick={props.onAction}>
          {props.actionLabel}
        </button>
      </div>
    </article>
  );
}
