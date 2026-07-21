/** Glowing setup action shared by every missing API-key state in the editor. */
import { KeyRound } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../classNames";

export function ApiKeyPromptPill(props: {
  children: ReactNode;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cx(
        "relative isolate inline-flex min-h-9 w-fit max-w-full items-center justify-center justify-self-center self-center overflow-hidden rounded-full border border-amber-300/70 bg-[linear-gradient(135deg,rgb(120_53_15_/_0.2),rgb(234_179_8_/_0.2))] px-3.5 py-1.5 text-xs font-semibold leading-4 text-amber-100 shadow-[inset_0_0_14px_rgb(250_204_21_/_0.12),0_0_14px_rgb(234_179_8_/_0.2)] transition-[transform,border-color,background-color,box-shadow] duration-200 hover:-translate-y-px hover:border-amber-200 hover:bg-[linear-gradient(135deg,rgb(146_64_14_/_0.28),rgb(250_204_21_/_0.26))] hover:shadow-[inset_0_0_16px_rgb(253_224_71_/_0.16),0_0_20px_rgb(234_179_8_/_0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70",
        props.className
      )}
      type="button"
      onClick={props.onClick}
      data-api-key-prompt
    >
      <span className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/80 to-transparent" />
      <KeyRound
        className="relative shrink-0 text-amber-200 drop-shadow-[0_0_5px_rgb(250_204_21_/_0.55)]"
        size={13}
      />
      <span className="relative min-w-0 text-center">{props.children}</span>
    </button>
  );
}
