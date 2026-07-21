/** Glowing setup action shared by every missing API-key state in the editor. */
import { KeyRound } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../classNames";

export function ApiKeyPromptPill(props: {
  children: ReactNode;
  className?: string;
  onClick: () => void;
  provider?: "gemini" | "cohere";
}) {
  const isCohere = props.provider === "cohere";

  return (
    <button
      className={cx(
        "relative isolate inline-flex min-h-9 w-fit max-w-full items-center justify-center justify-self-center self-center overflow-hidden rounded-full border px-3.5 py-1.5 text-xs font-semibold leading-4 transition-[transform,border-color,background-color,box-shadow] duration-200 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2",
        isCohere
          ? "border-emerald-300/65 bg-[linear-gradient(135deg,rgb(6_78_59_/_0.3),rgb(20_184_166_/_0.17))] text-emerald-50 shadow-[inset_0_0_14px_rgb(52_211_153_/_0.1),0_0_14px_rgb(16_185_129_/_0.18)] hover:border-emerald-200 hover:bg-[linear-gradient(135deg,rgb(6_95_70_/_0.36),rgb(45_212_191_/_0.22))] hover:shadow-[inset_0_0_16px_rgb(110_231_183_/_0.14),0_0_20px_rgb(16_185_129_/_0.27)] focus-visible:ring-emerald-200/70"
          : "border-cyan-300/70 bg-[linear-gradient(135deg,rgb(8_47_73_/_0.46),rgb(37_99_235_/_0.24))] text-cyan-50 shadow-[inset_0_0_14px_rgb(103_232_249_/_0.12),0_0_14px_rgb(14_165_233_/_0.22)] hover:border-sky-200 hover:bg-[linear-gradient(135deg,rgb(12_74_110_/_0.52),rgb(59_130_246_/_0.3))] hover:shadow-[inset_0_0_16px_rgb(165_243_252_/_0.16),0_0_20px_rgb(14_165_233_/_0.32)] focus-visible:ring-cyan-200/70",
        props.className
      )}
      type="button"
      onClick={props.onClick}
      data-api-key-prompt
    >
      <span className={cx(
        "pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent to-transparent",
        isCohere ? "via-emerald-100/80" : "via-cyan-100/85"
      )} />
      <KeyRound
        className={cx(
          "relative shrink-0",
          isCohere
            ? "text-emerald-200 drop-shadow-[0_0_5px_rgb(52_211_153_/_0.5)]"
            : "text-cyan-200 drop-shadow-[0_0_5px_rgb(34_211_238_/_0.55)]"
        )}
        size={13}
      />
      <span className="relative min-w-0 text-center">{props.children}</span>
    </button>
  );
}
