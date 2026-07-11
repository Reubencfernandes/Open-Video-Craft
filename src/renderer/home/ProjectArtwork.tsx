/** Real project preview with generated artwork as a legacy-project fallback. */
import { Film } from "lucide-react";
import { useMediaThumbnail } from "../editor/thumbnail-cache";

const artworkStyles = [
  "from-[#3b2818] via-[#6b4321] to-[#171717]",
  "from-[#1c3327] via-[#2f664b] to-[#171717]",
  "from-[#3b2020] via-[#704039] to-[#171717]",
  "from-[#292929] via-[#505050] to-[#171717]",
  "from-[#313016] via-[#62602b] to-[#171717]"
];

export function ProjectArtwork(props: { name: string; index: number; duration: string; thumbnailUrl?: string | null }) {
  return (
    <div className={`relative grid aspect-video place-items-center overflow-hidden rounded-lg bg-gradient-to-br ${artworkStyles[props.index % artworkStyles.length]} before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_70%_18%,rgb(255_255_255_/_0.18),transparent_32%)] before:content-['']`}>
      {props.thumbnailUrl ? <ProjectThumbnail url={props.thumbnailUrl} /> : <div className="relative grid justify-items-center gap-2 text-center">
        <span className="grid size-10 place-items-center rounded-xl border border-white/[0.12] bg-black/25 text-white"><Film size={20} /></span>
        <strong className="max-w-[10rem] text-sm text-white/90">{props.name}</strong>
      </div>}
      <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[0.64rem] font-medium tabular-nums text-white">{props.duration}</span>
    </div>
  );
}

function ProjectThumbnail({ url }: { url: string }) {
  const isImage = url.startsWith("data:image") || /\.(png|jpe?g|webp)(?:$|\?)/i.test(url);
  const { thumbnailUrl } = useMediaThumbnail({ url, kind: isImage ? "image" : "video" });
  return thumbnailUrl ? <img className="absolute inset-0 size-full object-cover" src={thumbnailUrl} alt="" /> : <span className="relative grid size-10 place-items-center rounded-xl bg-black/25 text-amber-200"><Film size={20} /></span>;
}
