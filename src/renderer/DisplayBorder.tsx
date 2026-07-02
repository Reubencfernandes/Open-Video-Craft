import { Monitor } from "lucide-react";

export function DisplayBorder() {
  const label =
    new URLSearchParams(window.location.search).get("label") || "Primary Display";

  return (
    <div className="pointer-events-none fixed inset-0 rounded-[10px] border-4 border-emerald-400 shadow-[inset_0_0_0_2px_rgb(2_6_23_/_0.72),0_0_36px_rgb(52_211_153_/_0.45)]">
      <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-emerald-300/40 bg-slate-950/80 px-3 py-2 text-xs font-extrabold text-emerald-100 shadow-[0_12px_34px_rgb(0_0_0_/_0.35)]">
        <Monitor size={16} />
        <span>{label}</span>
      </div>
    </div>
  );
}
