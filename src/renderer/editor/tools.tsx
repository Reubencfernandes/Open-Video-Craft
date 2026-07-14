/**
 * The left-rail tool catalog (order, labels, icons, rail artwork).
 */
import {
  Blend,
  FolderOpen,
  LayoutTemplate,
  Layers3,
  Music2,
  Pilcrow,
  Type,
  ZoomIn
} from "lucide-react";
import type { ReactNode } from "react";
import { SpeedIcon } from "./SpeedIcon";
import type { EditorTool } from "./types";

/**
 * The tools in the left rail, in display order.
 */
export const editorTools: Array<{
  id: EditorTool;
  label: string;
  icon: ReactNode;
}> = [
  { id: "media", label: "Media", icon: <FolderOpen size={19} /> },
  { id: "layout", label: "Layout", icon: <LayoutTemplate size={22} /> },
  { id: "style", label: "Style", icon: <Layers3 size={22} /> },
  { id: "transitions", label: "Transitions", icon: <Blend size={22} /> },
  { id: "subtitles", label: "Subtitles", icon: <Type size={22} /> },
  { id: "text", label: "Text", icon: <Pilcrow size={22} /> },
  { id: "zoom", label: "Zoom", icon: <ZoomIn size={22} /> },
  { id: "speed", label: "Speed", icon: <SpeedIcon size={22} /> },
  { id: "audio", label: "Audio", icon: <Music2 size={22} /> }
];
