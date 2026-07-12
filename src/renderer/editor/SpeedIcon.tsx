/**
 * Speedometer icon used by the Speed tool's small contexts.
 */
import { Gauge } from "lucide-react";

export function SpeedIcon(props: { size?: number; className?: string }) {
  return <Gauge size={props.size ?? 18} className={`shrink-0 ${props.className ?? ""}`} aria-hidden="true" />;
}
