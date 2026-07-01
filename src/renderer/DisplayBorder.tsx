import { Monitor } from "lucide-react";

export function DisplayBorder() {
  const label =
    new URLSearchParams(window.location.search).get("label") || "Primary Display";

  return (
    <div className="display-border-overlay">
      <div className="display-border-label">
        <Monitor size={24} />
        <span>{label}</span>
      </div>
    </div>
  );
}
