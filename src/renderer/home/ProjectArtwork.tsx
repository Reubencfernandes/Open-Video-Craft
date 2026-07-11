/** Lightweight generated artwork used when the project library has no poster URL. */
import { Film } from "lucide-react";

const artworkStyles = [
  "from-[#172554] via-[#312e81] to-[#111827]",
  "from-[#3f1d2e] via-[#4c1d95] to-[#111827]",
  "from-[#082f49] via-[#164e63] to-[#111827]",
  "from-[#1e3a2f] via-[#334155] to-[#111827]",
  "from-[#3b1d15] via-[#713f12] to-[#111827]"
];

export function ProjectArtwork(props: { name: string; index: number; duration: string }) {
  return (
    <div className={`relative grid aspect-video place-items-center overflow-hidden rounded-lg bg-gradient-to-br ${artworkStyles[props.index % artworkStyles.length]} before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_70%_18%,rgb(255_255_255_/_0.18),transparent_32%)] before:content-['']`}>
      <div className="relative grid justify-items-center gap-2 text-center">
        <span className="grid size-10 place-items-center rounded-xl border border-white/[0.12] bg-black/25 text-white"><Film size={20} /></span>
        <strong className="max-w-[10rem] text-sm text-white/90">{props.name}</strong>
      </div>
      <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[0.64rem] font-medium tabular-nums text-white">{props.duration}</span>
    </div>
  );
}
