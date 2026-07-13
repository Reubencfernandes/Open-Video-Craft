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
    <article className="flex min-h-[13rem] min-w-0 flex-col items-center px-4 py-5 text-center sm:px-5 xl:min-h-[14rem] xl:py-6">
      <span className="grid size-11 shrink-0 place-items-center">{props.icon}</span>
      <h2 className="m-0 mt-2 text-xl font-medium tracking-[-0.02em] text-white">{props.title}</h2>
      <p className="m-0 mt-2 max-w-[18rem] text-sm leading-6 text-slate-400">{props.description}</p>
      <button className="mt-auto inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.055] px-4 text-sm font-medium text-slate-100 transition hover:border-white/[0.12] hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-45 sm:w-fit sm:min-w-40 xl:min-w-44 xl:px-5" type="button" disabled={props.disabled} onClick={props.onAction}>
        {props.actionLabel}
      </button>
    </article>
  );
}
