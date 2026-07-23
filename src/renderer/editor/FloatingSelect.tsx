import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type FloatingSelectOption<T extends string> = {
  value: T;
  label: string;
};

/** Borderless editor select with a floating, animated option surface. */
export function FloatingSelect<T extends string>(props: {
  ariaLabel: string;
  value: T;
  options: ReadonlyArray<FloatingSelectOption<T>>;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const selectedOption =
    props.options.find((option) => option.value === props.value) ?? props.options[0];

  useEffect(() => {
    if (!open) return;

    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  useEffect(() => {
    if (props.disabled) setOpen(false);
  }, [props.disabled]);

  return (
    <div className="relative min-w-0" data-floating-select ref={rootRef}>
      <button
        ref={triggerRef}
        className={`flex h-10 w-full min-w-0 items-center justify-between gap-3 rounded-xl border bg-white/[0.055] px-3 text-left text-xs font-semibold text-white shadow-[0_8px_22px_rgb(0_0_0_/_0.14)] outline-none transition-[background-color,border-color,box-shadow,transform,opacity] duration-200 hover:bg-white/[0.085] focus-visible:border-[#ff4b73]/75 focus-visible:ring-2 focus-visible:ring-[#ff3b72]/15 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 ${
          open
            ? "border-[#ff4b73]/70 bg-[#ff3b72]/[0.08] shadow-[0_0_0_3px_rgb(255_59_114_/_0.11),0_8px_22px_rgb(0_0_0_/_0.2)]"
            : "border-white/[0.08]"
        }`}
        type="button"
        aria-label={props.ariaLabel}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={open}
        disabled={props.disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="min-w-0 truncate">{selectedOption?.label ?? props.value}</span>
        <ChevronDown
          className={`shrink-0 text-neutral-500 transition-transform duration-200 ${open ? "rotate-180 text-neutral-200" : ""}`}
          size={15}
          strokeWidth={2}
        />
      </button>

      <div
        id={listboxId}
        className={`absolute left-0 right-0 top-[calc(100%+0.45rem)] z-40 max-h-64 overflow-y-auto rounded-xl border border-white/[0.08] bg-[#19191c] p-1.5 shadow-[0_18px_46px_rgb(0_0_0_/_0.52)] transition-[opacity,transform,visibility] duration-200 ease-out ${
          open
            ? "visible translate-y-0 opacity-100"
            : "invisible pointer-events-none -translate-y-1.5 opacity-0"
        }`}
        role="listbox"
        aria-label={props.ariaLabel}
        aria-hidden={!open}
      >
        {props.options.map((option) => {
          const selected = option.value === props.value;
          return (
            <button
              className={`flex min-h-9 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-left text-xs font-semibold transition-colors ${
                selected
                  ? "bg-[#ff3b72]/[0.12] text-white"
                  : "text-neutral-400 hover:bg-white/[0.055] hover:text-white"
              }`}
              type="button"
              role="option"
              aria-selected={selected}
              tabIndex={open ? 0 : -1}
              key={option.value}
              onClick={() => {
                props.onChange(option.value);
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              <span>{option.label}</span>
              <Check
                className={`shrink-0 text-[#ff4b93] transition-opacity ${selected ? "opacity-100" : "opacity-0"}`}
                size={13}
                strokeWidth={2.5}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
