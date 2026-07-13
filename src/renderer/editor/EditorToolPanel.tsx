/**
 * Right-hand inspector router. Exactly one panel is rendered for the selected
 * rail category so controls from unrelated tools can never appear together.
 */
import { AudioPanel } from "./panels/AudioPanel";
import { CutPanel } from "./panels/CutPanel";
import { LayoutPanel } from "./panels/LayoutPanel";
import { MediaInspectorPanel } from "./panels/MediaInspectorPanel";
import { SpeedPanel } from "./panels/SpeedPanel";
import { StylePanel } from "./panels/StylePanel";
import { SubtitlesPanel } from "./panels/SubtitlesPanel";
import { ZoomPanel } from "./panels/ZoomPanel";
import { SlidersHorizontal } from "lucide-react";
import { editorTools } from "./tools";
import type {
  BackgroundCategory,
  BackgroundStyle,
  CameraContentTransform,
  CameraBorderStyle,
  CameraPosition,
  CameraShape,
  EditorMediaItem,
  EditorTool,
  LayoutMode,
  ScreenAspectRatio,
  SpeedEffect,
  SubtitleSegment,
  SubtitleStyle,
  TimelineMediaClip,
  VideoCornerStyle,
  ZoomEffect
} from "./types";

export function EditorToolPanel(props: {
  activeTool: EditorTool;
  layoutMode: LayoutMode;
  screenScale: number;
  screenAspectRatio: ScreenAspectRatio;
  screenAspectEnabled: boolean;
  cameraShape: CameraShape;
  cameraBorderStyle: CameraBorderStyle;
  cameraPosition: CameraPosition;
  cameraSize: number;
  cameraContentTransform: CameraContentTransform;
  masterVolume: number;
  audioSources: EditorMediaItem[];
  audioLevels: Record<string, { volume: number; muted: boolean }>;
  audioPlaying: boolean;
  getAudioLevel: () => number;
  previewItem: EditorMediaItem | null;
  selectedZoomEffect: ZoomEffect | null;
  selectedSpeedEffect: SpeedEffect | null;
  sttStatus: "idle" | "loading" | "transcribing" | "done" | "error";
  sttDownloadProgress: number | null;
  sttModelLabel: string;
  subtitleLanguage: string;
  subtitleStyle: SubtitleStyle;
  subtitles: SubtitleSegment[];
  selectedSubtitle: SubtitleSegment | null;
  selectedClip: TimelineMediaClip | null;
  activeBackgroundCategory: BackgroundCategory;
  backgroundStyle: BackgroundStyle;
  videoCornerStyle: VideoCornerStyle;
  onSelectItem: (itemId: string) => void;
  onLayoutModeChange: (mode: LayoutMode) => void;
  onScreenScaleChange: (scale: number) => void;
  onScreenAspectRatioChange: (aspectRatio: ScreenAspectRatio) => void;
  onCameraShapeChange: (shape: CameraShape) => void;
  onCameraBorderStyleChange: (border: CameraBorderStyle) => void;
  onCameraPositionChange: (position: CameraPosition) => void;
  onCameraSizeChange: (size: number) => void;
  onCameraContentTransformChange: (patch: Partial<CameraContentTransform>) => void;
  onCameraContentTransformReset: () => void;
  onMasterVolumeChange: (volume: number) => void;
  onAddBackgroundMusic: () => void;
  onSetAudioLevel: (itemId: string, patch: Partial<{ volume: number; muted: boolean }>) => void;
  onAddZoom: () => void;
  onUpdateZoom: (id: string, updates: Partial<ZoomEffect>) => void;
  onRemoveZoom: (id: string) => void;
  onPreviewZoomCurve: (effect: ZoomEffect, progress: number | null) => void;
  onAddSpeed: () => void;
  onUpdateSpeed: (id: string, updates: Partial<SpeedEffect>) => void;
  onRemoveSpeed: (id: string) => void;
  onAddSubtitle: () => void;
  onGenerateSubtitles: () => void;
  onSubtitleStyleChange: (style: SubtitleStyle) => void;
  onUpdateSubtitle: (id: string, updates: Partial<SubtitleSegment>) => void;
  onSelectSubtitle: (subtitleId: string | null) => void;
  onSplitAtPlayhead: () => void;
  onDeleteSelected: () => void;
  onBackgroundCategoryChange: (category: BackgroundCategory) => void;
  onBackgroundStyleChange: (style: BackgroundStyle) => void;
  onUploadCustomBackground: () => void;
  onCornerStyleChange: (style: VideoCornerStyle) => void;
}) {
  const activeToolMeta = editorTools.find((tool) => tool.id === props.activeTool);
  return (
    <aside className="editor-inspector order-4 flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-white/[0.08] bg-[#1b1f27]">
      <header className="flex min-h-10 items-center gap-2 border-b border-white/[0.08] px-3 text-xs font-semibold text-slate-200">
        <SlidersHorizontal size={14} className="text-slate-400" />
        <span>Properties</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[0.68rem] font-medium text-slate-500">
          <span className="text-[#d8bd82]">{activeToolMeta?.icon}</span>
          {activeToolMeta?.label ?? "Inspector"}
        </span>
      </header>

      <div className="editor-inspector-content flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-3">

      {props.activeTool === "media" ? <MediaInspectorPanel item={props.previewItem} /> : null}

      {props.activeTool === "layout" ? (
        <LayoutPanel
          layoutMode={props.layoutMode}
          screenScale={props.screenScale}
          screenAspectRatio={props.screenAspectRatio}
          screenAspectEnabled={props.screenAspectEnabled}
          cameraShape={props.cameraShape}
          cameraBorderStyle={props.cameraBorderStyle}
          cameraContentTransform={props.cameraContentTransform}
          cameraPosition={props.cameraPosition}
          cameraSize={props.cameraSize}
          onLayoutModeChange={props.onLayoutModeChange}
          onScreenScaleChange={props.onScreenScaleChange}
          onScreenAspectRatioChange={props.onScreenAspectRatioChange}
          onCameraShapeChange={props.onCameraShapeChange}
          onCameraBorderStyleChange={props.onCameraBorderStyleChange}
          onCameraContentTransformChange={props.onCameraContentTransformChange}
          onCameraContentTransformReset={props.onCameraContentTransformReset}
          onCameraPositionChange={props.onCameraPositionChange}
          onCameraSizeChange={props.onCameraSizeChange}
        />
      ) : null}

      {props.activeTool === "audio" ? (
        <AudioPanel
          masterVolume={props.masterVolume}
          audioSources={props.audioSources}
          audioLevels={props.audioLevels}
          playing={props.audioPlaying}
          getAudioLevel={props.getAudioLevel}
          onMasterVolumeChange={props.onMasterVolumeChange}
          onAddBackgroundMusic={props.onAddBackgroundMusic}
          onSelectItem={props.onSelectItem}
          onSetAudioLevel={props.onSetAudioLevel}
        />
      ) : null}

      {props.activeTool === "zoom" ? (
        <ZoomPanel
          previewItem={props.previewItem}
          selectedZoomEffect={props.selectedZoomEffect}
          onAddZoom={props.onAddZoom}
          onUpdateZoom={props.onUpdateZoom}
          onRemoveZoom={props.onRemoveZoom}
          onPreviewCurve={props.onPreviewZoomCurve}
        />
      ) : null}

      {props.activeTool === "speed" ? (
        <SpeedPanel
          selectedSpeedEffect={props.selectedSpeedEffect}
          onAddSpeed={props.onAddSpeed}
          onUpdateSpeed={props.onUpdateSpeed}
          onRemoveSpeed={props.onRemoveSpeed}
        />
      ) : null}

      {props.activeTool === "subtitles" ? (
        <SubtitlesPanel
          sttDownloadProgress={props.sttDownloadProgress}
          sttStatus={props.sttStatus}
          sttModelLabel={props.sttModelLabel}
          subtitleLanguage={props.subtitleLanguage}
          subtitleStyle={props.subtitleStyle}
          subtitles={props.subtitles}
          selectedSubtitle={props.selectedSubtitle}
          onAddSubtitle={props.onAddSubtitle}
          onGenerateSubtitles={props.onGenerateSubtitles}
          onStyleChange={props.onSubtitleStyleChange}
          onUpdateSubtitle={props.onUpdateSubtitle}
          onSelectSubtitle={props.onSelectSubtitle}
        />
      ) : null}

      {props.activeTool === "cut" ? (
        <CutPanel
          selectedClip={props.selectedClip}
          onSplitAtPlayhead={props.onSplitAtPlayhead}
          onDeleteSelected={props.onDeleteSelected}
        />
      ) : null}

      {props.activeTool === "style" ? (
        <StylePanel
          activeCategory={props.activeBackgroundCategory}
          backgroundStyle={props.backgroundStyle}
          videoCornerStyle={props.videoCornerStyle}
          onCategoryChange={props.onBackgroundCategoryChange}
          onBackgroundStyleChange={props.onBackgroundStyleChange}
          onUploadCustomBackground={props.onUploadCustomBackground}
          onCornerStyleChange={props.onCornerStyleChange}
        />
      ) : null}
      </div>
    </aside>
  );
}
