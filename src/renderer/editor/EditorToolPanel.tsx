/**
 * Active-tool content router shown beside the editor tool rail.
 */
import type {
  MusicGenerateProgressEvent,
  ProviderKeysView,
  SttProviderId
} from "../../shared/types";
import type { GeminiChatMessage } from "../../shared/types";
import type { MusicGenerationForm, MusicGenerationState } from "./useMusicGeneration";
import { AssistantPanel } from "./panels/AssistantPanel";
import { AudioPanel } from "./panels/AudioPanel";
import { LayoutPanel } from "./panels/LayoutPanel";
import { MusicPanel } from "./panels/MusicPanel";
import { SpeedPanel } from "./panels/SpeedPanel";
import { StylePanel } from "./panels/StylePanel";
import { SubtitlesPanel } from "./panels/SubtitlesPanel";
import { TransitionPanel } from "./panels/TransitionPanel";
import { TextPanel } from "./panels/TextPanel";
import { ZoomPanel } from "./panels/ZoomPanel";
import type {
  BackgroundCategory,
  BackgroundStyle,
  CameraContentTransform,
  CameraBorderStyle,
  CameraPosition,
  CameraShape,
  ClipTransition,
  EditorMediaItem,
  EditorTool,
  LayoutMode,
  ScreenAspectRatio,
  SpeedEffect,
  SubtitleSegment,
  SubtitleStyle,
  TextOverlay,
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
  previewItem: EditorMediaItem | null;
  selectedZoomEffect: ZoomEffect | null;
  selectedSpeedEffect: SpeedEffect | null;
  transitions: ClipTransition[];
  selectedTransitionId: string | null;
  videoClips: TimelineMediaClip[];
  sttStatus: "idle" | "loading" | "transcribing" | "done" | "error";
  sttDownloadProgress: number | null;
  sttModelLabel: string;
  sttProvider: SttProviderId;
  providerKeys: ProviderKeysView | null;
  onCancelTranscription: () => void;
  onSttProviderChange: (provider: SttProviderId) => void;
  onCohereLanguageChange: (language: string) => void;
  onOpenAiSettings: () => void;
  musicGenerationState: MusicGenerationState;
  musicProgress: MusicGenerateProgressEvent | null;
  musicLastLyrics: string | null;
  onMusicGenerate: (form: MusicGenerationForm) => void;
  onMusicCancel: () => void;
  assistantProjectId: string | null;
  assistantMessages: GeminiChatMessage[];
  assistantSending: boolean;
  assistantStatusMessage: string | null;
  assistantError: string | null;
  onAssistantSend: (message: string) => void;
  onAssistantCancel: () => void;
  onAssistantReset: () => void;
  onAssistantUndoEdit: () => void;
  subtitleLanguage: string;
  subtitleStyle: SubtitleStyle;
  subtitles: SubtitleSegment[];
  selectedSubtitle: SubtitleSegment | null;
  currentTime: number;
  textOverlays: TextOverlay[];
  selectedTextOverlay: TextOverlay | null;
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
  onSetTransition: (input: Omit<ClipTransition, "id">) => void;
  onRemoveTransition: (fromSegmentId: string, toSegmentId: string) => void;
  onAddSubtitle: () => void;
  onGenerateSubtitles: () => void;
  onSubtitleStyleChange: (style: SubtitleStyle) => void;
  onUpdateSubtitle: (id: string, updates: Partial<SubtitleSegment>) => void;
  onSelectSubtitle: (subtitleId: string | null) => void;
  onSelectTextOverlay: (id: string) => void;
  onUpdateTextOverlay: (id: string, updates: Partial<TextOverlay>) => void;
  onRemoveTextOverlay: (id: string) => void;
  onBackgroundCategoryChange: (category: BackgroundCategory) => void;
  onBackgroundStyleChange: (style: BackgroundStyle) => void;
  onUploadCustomBackground: () => void;
  onCornerStyleChange: (style: VideoCornerStyle) => void;
}) {
  return (
    <div
      className={`flex min-h-0 flex-1 flex-col gap-2.5 transition ${
        props.activeTool === "assistant" ? "overflow-hidden" : "overflow-auto"
      }`}
    >

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

      {props.activeTool === "transitions" ? (
        <TransitionPanel
          videoClips={props.videoClips}
          transitions={props.transitions}
          selectedTransitionId={props.selectedTransitionId}
          onSetTransition={props.onSetTransition}
          onRemoveTransition={props.onRemoveTransition}
        />
      ) : null}

      {props.activeTool === "assistant" ? (
        <AssistantPanel
          projectId={props.assistantProjectId}
          providerKeys={props.providerKeys}
          messages={props.assistantMessages}
          sending={props.assistantSending}
          statusMessage={props.assistantStatusMessage}
          chatError={props.assistantError}
          onSend={props.onAssistantSend}
          onCancel={props.onAssistantCancel}
          onReset={props.onAssistantReset}
          onUndoEdit={props.onAssistantUndoEdit}
          onOpenAiSettings={props.onOpenAiSettings}
        />
      ) : null}

      {props.activeTool === "music" ? (
        <MusicPanel
          generationState={props.musicGenerationState}
          progress={props.musicProgress}
          lastLyrics={props.musicLastLyrics}
          providerKeys={props.providerKeys}
          onGenerate={props.onMusicGenerate}
          onCancel={props.onMusicCancel}
          onOpenAiSettings={props.onOpenAiSettings}
        />
      ) : null}

      {props.activeTool === "subtitles" ? (
        <SubtitlesPanel
          sttDownloadProgress={props.sttDownloadProgress}
          sttStatus={props.sttStatus}
          sttModelLabel={props.sttModelLabel}
          sttProvider={props.sttProvider}
          providerKeys={props.providerKeys}
          onCancelTranscription={props.onCancelTranscription}
          onSttProviderChange={props.onSttProviderChange}
          onCohereLanguageChange={props.onCohereLanguageChange}
          onOpenAiSettings={props.onOpenAiSettings}
          subtitleLanguage={props.subtitleLanguage}
          subtitleStyle={props.subtitleStyle}
          subtitles={props.subtitles}
          selectedSubtitle={props.selectedSubtitle}
          currentTime={props.currentTime}
          onAddSubtitle={props.onAddSubtitle}
          onGenerateSubtitles={props.onGenerateSubtitles}
          onStyleChange={props.onSubtitleStyleChange}
          onUpdateSubtitle={props.onUpdateSubtitle}
          onSelectSubtitle={props.onSelectSubtitle}
        />
      ) : null}

      {props.activeTool === "text" ? (
        <TextPanel
          overlays={props.textOverlays}
          selectedOverlay={props.selectedTextOverlay}
          onSelect={props.onSelectTextOverlay}
          onUpdate={props.onUpdateTextOverlay}
          onRemove={props.onRemoveTextOverlay}
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
  );
}
