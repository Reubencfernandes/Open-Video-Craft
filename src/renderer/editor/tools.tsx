import {
  Captions,
  FolderOpen,
  LayoutTemplate,
  Palette,
  Scissors,
  Volume2,
  ZoomIn
} from "lucide-react";
import type { ReactNode } from "react";
import setupIcon from "../assets/rail-icons/icon1.png";
import cutIcon from "../assets/rail-icons/icon2.png";
import layoutIcon from "../assets/rail-icons/icon3.png";
import zoomIcon from "../assets/rail-icons/icon4.png";
import styleIcon from "../assets/rail-icons/icon5.png";
import subtitleIcon from "../assets/rail-icons/icon6.png";
import audioIcon from "../assets/rail-icons/icon7.png";
import { SpeedIcon } from "./SpeedIcon";
import type { EditorTool } from "./types";

/**
 * The tools in the left rail, in display order. `image` is the rail button
 * artwork and `icon` is the small vector used in the tool panel header.
 */
export const editorTools: Array<{
  id: EditorTool;
  label: string;
  icon: ReactNode;
  image?: string;
}> = [
  { id: "media", label: "Setup", icon: <FolderOpen size={18} />, image: setupIcon },
  { id: "cut", label: "Cut", icon: <Scissors size={18} />, image: cutIcon },
  { id: "layout", label: "Layout", icon: <LayoutTemplate size={18} />, image: layoutIcon },
  { id: "zoom", label: "Zoom", icon: <ZoomIn size={18} />, image: zoomIcon },
  { id: "speed", label: "Speed", icon: <SpeedIcon size={18} />, image: undefined },
  { id: "style", label: "Style", icon: <Palette size={18} />, image: styleIcon },
  { id: "subtitles", label: "Subs", icon: <Captions size={18} />, image: subtitleIcon },
  { id: "audio", label: "Audio", icon: <Volume2 size={18} />, image: audioIcon }
];
