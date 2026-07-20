/** Shared glossy pink action used for primary creation actions. */
import type { ButtonHTMLAttributes } from "react";

const bubblePattern = [
  { x: 4, y: 16, size: 5 },
  { x: 9, y: 63, size: 3 },
  { x: 18, y: 39, size: 6 },
  { x: 27, y: 8, size: 3 },
  { x: 31, y: 72, size: 5 },
  { x: 42, y: 29, size: 4 },
  { x: 49, y: 57, size: 6 },
  { x: 59, y: 13, size: 4 },
  { x: 65, y: 75, size: 3 },
  { x: 72, y: 42, size: 5 },
  { x: 81, y: 18, size: 3 },
  { x: 87, y: 66, size: 4 },
  { x: 94, y: 34, size: 3 }
] as const;

function PixelPattern(props: { copy: "first" | "second" }) {
  return (
    <span
      className={`new-project-pixel-pattern new-project-pixel-pattern-${props.copy} absolute inset-y-0 w-1/2`}
    >
      {bubblePattern.map((bubble, index) => (
        <i
          className="new-project-bubble"
          key={index}
          style={{
            left: `${bubble.x}%`,
            top: `${bubble.y}%`,
            width: bubble.size,
            height: bubble.size
          }}
        />
      ))}
    </span>
  );
}

export function BubbleActionButton({
  children,
  className = "",
  type = "button",
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...buttonProps}
      className={`group relative inline-flex items-center justify-center overflow-hidden border border-pink-200/30 bg-[#ff3192] text-white shadow-[0_0_18px_rgb(255_49_146_/_0.2),0_8px_22px_rgb(0_0_0_/_0.28)] outline-none transition duration-200 hover:scale-[1.01] hover:brightness-110 hover:shadow-[0_0_24px_rgb(255_49_146_/_0.34),0_10px_26px_rgb(0_0_0_/_0.32)] focus-visible:ring-2 focus-visible:ring-pink-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b0d] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-45 ${className}`}
      data-bubble-action-button
      type={type}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.2)_0%,rgba(255,255,255,0.02)_38%,rgba(177,0,76,0.14)_100%),radial-gradient(ellipse_at_center,rgba(255,76,165,0.92)_0%,rgba(255,42,139,0.96)_60%,rgba(240,37,128,1)_100%)]"
      />
      <span aria-hidden="true" className="new-project-pixel-viewport absolute inset-0 overflow-hidden">
        <span className="new-project-pixel-belt absolute inset-y-0 left-0 w-[200%]">
          <PixelPattern copy="first" />
          <PixelPattern copy="second" />
        </span>
      </span>
      <span className="relative z-10 inline-flex items-center justify-center gap-2 drop-shadow-[0_1px_2px_rgba(112,0,49,0.35)]">
        {children}
      </span>
    </button>
  );
}
