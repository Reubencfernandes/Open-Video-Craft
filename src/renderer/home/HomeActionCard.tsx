/** Reusable launcher card for one primary create/open workflow. */
import { ArrowUpRight } from "lucide-react";
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
    <button
      className="group flex min-h-28 min-w-0 items-center gap-3 rounded-2xl bg-[#19191c] p-4 text-left shadow-[0_10px_26px_rgb(0_0_0_/_0.16)] transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-[#21171d] disabled:cursor-not-allowed disabled:opacity-45"
      type="button"
      disabled={props.disabled}
      onClick={props.onAction}
      data-home-action-card
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[linear-gradient(145deg,#5f153d,#a6175c)] text-pink-100 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.14),0_8px_20px_rgb(255_49_146_/_0.12)]">
        {props.icon}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-sm font-semibold text-white">{props.title}</strong>
        <span className="mt-1 block text-[0.68rem] leading-4 text-neutral-500">{props.description}</span>
        <span className="mt-2 block text-[0.62rem] font-semibold text-neutral-400 transition-colors group-hover:text-[#ff6ba5]">
          {props.actionLabel}
        </span>
      </span>
      <ArrowUpRight className="shrink-0 text-neutral-600 transition-[color,transform] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white" size={15} />
    </button>
  );
}
