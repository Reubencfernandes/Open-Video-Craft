/**
 * The right-hand properties panel: a tab strip (Video / Audio / Effects, plus
 * a contextual tab for the other tools) that routes the active tool to its
 * panel component and forwards the relevant slice of editor state/handlers.
 * The media library lives in its own always-visible panel on the left.
 */
import { AudioPanel } from "./panels/AudioPanel";
import { CutPanel } from "./panels/CutPanel";
import { VideoInspectorPanel } from "./panels/VideoInspectorPanel";
import { SpeedPanel } from "./panels/SpeedPanel";
import { StylePanel } from "./panels/StylePanel";
import { SubtitlesPanel } from "./panels/SubtitlesPanel";
import { ZoomPanel } from "./panels/ZoomPanel";
import { EditorPropertyTabs } from "./EditorPropertyTabs";
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
  onToolChange: (tool: EditorTool) => void;
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
  onSelectItem: (itemId: string) => void;
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
  // The media library lives on the left; while it is the active rail tool the
  // properties panel falls back to the Video (layout) tab.
  const effectiveTool: EditorTool = props.activeTool === "media" ? "layout" : props.activeTool;
  return (
    <aside className="order-4 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-white/[0.07] bg-[#111214] shadow-[0_18px_45px_rgb(0_0_0_/_0.24)]">
      <EditorPropertyTabs effectiveTool={effectiveTool} onToolChange={props.onToolChange} />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">

      {effectiveTool === "layout" ? (
        <VideoInspectorPanel scale={props.screenScale} transform={props.cameraContentTransform} onScaleChange={props.onScreenScaleChange} onTransformChange={props.onCameraContentTransformChange} onReset={props.onCameraContentTransformReset} />
      ) : null}

      {effectiveTool === "audio" ? (
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

      {effectiveTool === "zoom" ? (
        <ZoomPanel
          previewItem={props.previewItem}
          selectedZoomEffect={props.selectedZoomEffect}
          onAddZoom={props.onAddZoom}
          onUpdateZoom={props.onUpdateZoom}
          onRemoveZoom={props.onRemoveZoom}
        />
      ) : null}

      {effectiveTool === "speed" ? (
        <SpeedPanel
          selectedSpeedEffect={props.selectedSpeedEffect}
          onAddSpeed={props.onAddSpeed}
          onUpdateSpeed={props.onUpdateSpeed}
          onRemoveSpeed={props.onRemoveSpeed}
        />
      ) : null}

      {effectiveTool === "subtitles" ? (
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

      {effectiveTool === "cut" ? (
        <CutPanel
          selectedClip={props.selectedClip}
          onSplitAtPlayhead={props.onSplitAtPlayhead}
          onDeleteSelected={props.onDeleteSelected}
        />
      ) : null}

      {effectiveTool === "style" ? (
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
