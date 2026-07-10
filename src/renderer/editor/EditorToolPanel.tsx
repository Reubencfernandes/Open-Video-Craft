/**
 * Routes the active left-rail tool to its panel component and forwards the
 * relevant slice of editor state/handlers.
 */
import { ToolPanelHeader } from "./controls";
import { AudioPanel } from "./panels/AudioPanel";
import { CutPanel } from "./panels/CutPanel";
import { LayoutPanel } from "./panels/LayoutPanel";
import { MediaPanel } from "./panels/MediaPanel";
import { SpeedPanel } from "./panels/SpeedPanel";
import { StylePanel } from "./panels/StylePanel";
import { SubtitlesPanel } from "./panels/SubtitlesPanel";
import { ZoomPanel } from "./panels/ZoomPanel";
import { editorTools } from "./tools";
import type {
  BackgroundCategory,
  BackgroundStyle,
  CameraBorderStyle,
  CameraContentTransform,
  CameraPosition,
  CameraShape,
  EditorMediaItem,
  EditorTool,
  LayoutMode,
  MediaPanel as MediaPanelTab,
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
  activePanel: MediaPanelTab;
  visibleMedia: EditorMediaItem[];
  selectedItemId: string | null;
  layoutMode: LayoutMode;
  screenScale: number;
  screenAspectRatio: ScreenAspectRatio;
  screenAspectEnabled: boolean;
  cameraShape: CameraShape;
  cameraBorderStyle: CameraBorderStyle;
  cameraContentTransform: CameraContentTransform;
  cameraPosition: CameraPosition;
  cameraSize: number;
  masterVolume: number;
  audioSources: EditorMediaItem[];
  audioLevels: Record<string, { volume: number; muted: boolean }>;
  audioPlaying: boolean;
  getAudioLevel: () => number;
  previewItem: EditorMediaItem | null;
  selectedZoomEffect: ZoomEffect | null;
  selectedSpeedEffect: SpeedEffect | null;
  sttStatus: "idle" | "loading" | "transcribing" | "done" | "error";
  sttModelLabel: string;
  subtitleLanguage: string;
  subtitleStyle: SubtitleStyle;
  subtitles: SubtitleSegment[];
  selectedSubtitle: SubtitleSegment | null;
  selectedClip: TimelineMediaClip | null;
  activeBackgroundCategory: BackgroundCategory;
  backgroundStyle: BackgroundStyle;
  videoCornerStyle: VideoCornerStyle;
  onImportMedia: () => void;
  onTabChange: (panel: MediaPanelTab) => void;
  onSelectItem: (itemId: string) => void;
  onItemDuration: (itemId: string, duration: number | null) => void;
  onRemoveItem: (itemId: string) => void;
  onLayoutModeChange: (mode: LayoutMode) => void;
  onScreenScaleChange: (scale: number) => void;
  onScreenAspectRatioChange: (aspectRatio: ScreenAspectRatio) => void;
  onCameraShapeChange: (shape: CameraShape) => void;
  onCameraBorderStyleChange: (border: CameraBorderStyle) => void;
  onCameraContentTransformChange: (patch: Partial<CameraContentTransform>) => void;
  onCameraContentTransformReset: () => void;
  onCameraPositionChange: (position: CameraPosition) => void;
  onCameraSizeChange: (size: number) => void;
  onMasterVolumeChange: (volume: number) => void;
  onAddBackgroundMusic: () => void;
  onSetAudioLevel: (itemId: string, patch: Partial<{ volume: number; muted: boolean }>) => void;
  onAddZoom: () => void;
  onUpdateZoom: (id: string, updates: Partial<ZoomEffect>) => void;
  onRemoveZoom: (id: string) => void;
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
    <aside className="flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden bg-transparent p-[0.9rem]">
      <ToolPanelHeader icon={activeToolMeta?.icon} title={activeToolMeta?.label ?? "Tools"} />

      {props.activeTool === "media" ? (
        <MediaPanel
          activeTab={props.activePanel}
          visibleMedia={props.visibleMedia}
          selectedItemId={props.selectedItemId}
          onImport={props.onImportMedia}
          onTabChange={props.onTabChange}
          onSelectItem={props.onSelectItem}
          onItemDuration={props.onItemDuration}
          onRemoveItem={props.onRemoveItem}
        />
      ) : null}

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
    </aside>
  );
}
