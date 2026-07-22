/** Real project preview that remains empty until its thumbnail has loaded. */
import { useState } from "react";
import { useMediaThumbnail } from "../editor/thumbnail-cache";

export function ProjectArtwork(props: { name: string; index: number; duration: string; thumbnailUrl?: string | null }) {
  return (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-[#101012]" data-project-artwork>
      {props.thumbnailUrl ? <ProjectThumbnail url={props.thumbnailUrl} /> : null}
      <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[0.64rem] font-medium tabular-nums text-white">{props.duration}</span>
    </div>
  );
}

function ProjectThumbnail({ url }: { url: string }) {
  const isImage = url.startsWith("data:image") || /\.(png|jpe?g|webp)(?:$|\?)/i.test(url);
  const { thumbnailUrl } = useMediaThumbnail({ url, kind: isImage ? "image" : "video" });
  return thumbnailUrl ? <LoadedThumbnailImage key={thumbnailUrl} url={thumbnailUrl} /> : null;
}

function LoadedThumbnailImage({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <img
      className={`absolute inset-0 size-full object-cover transition-opacity duration-150 ${loaded ? "opacity-100" : "opacity-0"}`}
      src={url}
      alt=""
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(false)}
    />
  );
}
