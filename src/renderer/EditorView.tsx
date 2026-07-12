/**
 * EditorView: the video editor window's composition root.
 *
 * This component intentionally contains no editing logic. It does three
 * things only:
 *
 *   1. Declares the editor's shared state (media library, timeline segments,
 *      effects, layout/style settings, selection).
 *   2. Wires that state into the focused hooks under ./editor/ that implement
 *      every behavior — persistence, derived view data, playback, viewport,
 *      media actions, export, preview layout, and the timeline controller
 *      facade (editing, drags, clipboard, effects, transcription, shortcuts).
 *   3. Renders the layout from the presentational components under ./editor/
 *      (ToolRail, EditorToolPanel, EditorPreviewPanel, EditorTimelineSection,
 *      ExportDialog, notifications).
 *
 */
import { useEffect, useRef, useState } from "react";
import type {
  ProjectView
} from "../shared/types";
import { ExportDialog } from "./editor/ExportDialog";
import { EditorNotifications } from "./editor/EditorNotifications";
import { UpdateNotification } from "./notifications/UpdateNotification";
import { EditorPreviewPanel } from "./editor/EditorPreviewPanel";
import { EditorTimelineSection } from "./editor/EditorTimelineSection";
import { EditorToolPanel } from "./editor/EditorToolPanel";
import { EditorTopbar } from "./editor/EditorTopbar";
import { ToolRail } from "./editor/ToolRail";
import { getCameraFrameFromPreset } from "./editor/layout-geometry";
import { MediaPanel } from "./editor/panels/MediaPanel";
import { useEditorDerivedData } from "./editor/useEditorDerivedData";
import { useEditorExport } from "./editor/useEditorExport";
import { useEditorMediaActions } from "./editor/useEditorMediaActions";
import { useEditorPlayback } from "./editor/useEditorPlayback";
import { useEditorPersistence } from "./editor/useEditorPersistence";
import { usePreviewLayoutControls } from "./editor/usePreviewLayoutControls";
import { useTimelineController } from "./editor/useTimelineController";
import { useTimelineViewport } from "./editor/useTimelineViewport";
import { useAppUpdateStatus } from "./useAppUpdateStatus";
import {
  formatSubtitleLanguage,
  whisperTranscriptionModelLabel
} from "./editor/subtitle-transcription";
import { canSplitTimelineSegmentAt } from "./editor/timeline-utils";
import { clampNumber } from "./editor/utils";
import { getZoomPreviewTime } from "./editor/zoom-utils";
import type {
  BackgroundCategory,
  BackgroundStyle,
  CameraBorderStyle,
  CameraContentTransform,
  CameraFrame,
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
  TimelineContextMenu,
  TimelineSegment,
  VideoCornerStyle,
  ZoomEffect
} from "./editor/types";

export function EditorView() {
  const [projectId, setProjectId] = useState(() =>
    new URLSearchParams(window.location.search).get("projectId")
  );
  const [project, setProject] = useState<ProjectView | null>(null);
  const [importedMedia, setImportedMedia] = useState<EditorMediaItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<MediaPanelTab>("all");
  const [activeTool, setActiveTool] = useState<EditorTool>("media");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("bubble");
  // New compositions start on the warm Ember background so the canvas matches
  // the editor's neutral/amber palette; saved projects keep their own choice.
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>("real-world-6");
  const [activeBackgroundCategory, setActiveBackgroundCategory] =
    useState<BackgroundCategory>("image");
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState<string | null>(null);
  const [customBackgroundImportId, setCustomBackgroundImportId] = useState<string | null>(null);
  const [screenPosition, setScreenPosition] = useState({
    x: 0,
    y: 0,
    scale: 100
  });
  const [screenAspectRatio, setScreenAspectRatio] = useState<ScreenAspectRatio>("16:9");
  const [cameraSize, setCameraSize] = useState(24);
  const [cameraPosition, setCameraPosition] = useState<CameraPosition>("bottom-right");
  const [cameraFrame, setCameraFrame] = useState<CameraFrame>(() =>
    getCameraFrameFromPreset("bottom-right", 24)
  );
  const [cameraContentTransform, setCameraContentTransform] =
    useState<CameraContentTransform>({
      x: 0,
      y: 0,
      scale: 100,
      mirrored: false
    });
  const [cameraShape, setCameraShape] = useState<CameraShape>("circle");
  const [cameraBorderStyle, setCameraBorderStyle] = useState<CameraBorderStyle>("light");
  const [videoCornerStyle, setVideoCornerStyle] = useState<VideoCornerStyle>("soft");
  const [masterVolume, setMasterVolume] = useState(100);
  const [audioLevels, setAudioLevels] = useState<
    Record<string, { volume: number; muted: boolean }>
  >({});
  const [backgroundAudioIds, setBackgroundAudioIds] = useState<string[]>([]);
  const [zoomEffects, setZoomEffects] = useState<ZoomEffect[]>([]);
  const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null);
  const [zoomPreviewTime, setZoomPreviewTime] = useState<number | null>(null);
  const [speedEffects, setSpeedEffects] = useState<SpeedEffect[]>([]);
  const [selectedSpeedId, setSelectedSpeedId] = useState<string | null>(null);
  const [subtitles, setSubtitles] = useState<SubtitleSegment[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [subtitleLanguage, setSubtitleLanguage] = useState<string | null>(null);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>("karaoke");
  const [trimRange, setTrimRange] = useState({ start: 0, end: 0 });
  const [timelineSegments, setTimelineSegments] = useState<TimelineSegment[]>([]);
  const [selectedTimelineSegmentId, setSelectedTimelineSegmentId] = useState<string | null>(null);
  const [timelineContextMenu, setTimelineContextMenu] = useState<TimelineContextMenu>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [scrubbingTimeline, setScrubbingTimeline] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [timelineViewDuration, setTimelineViewDuration] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(1);
  const { updateStatus, installUpdate } = useAppUpdateStatus();

  const knownTimelineItemIdsRef = useRef<Set<string>>(new Set());

  const { isReady: isEditorStateReady, saving, saveState } = useEditorPersistence({
    activeBackgroundCategory,
    audioLevels,
    backgroundAudioIds,
    backgroundStyle,
    cameraBorderStyle,
    cameraContentTransform,
    cameraFrame,
    cameraPosition,
    cameraShape,
    cameraSize,
    customBackgroundImportId,
    importedMedia,
    knownTimelineItemIdsRef,
    layoutMode,
    masterVolume,
    onProjectCreated: (nextProjectId) => {
      setProjectId(nextProjectId);
      const url = new URL(window.location.href);
      url.searchParams.set("projectId", nextProjectId);
      window.history.replaceState(null, "", url);
    },
    project,
    projectId,
    screenAspectRatio,
    screenPosition,
    setActiveBackgroundCategory,
    setAudioLevels,
    setBackgroundAudioIds,
    setBackgroundStyle,
    setCameraBorderStyle,
    setCameraContentTransform,
    setCameraFrame,
    setCameraPosition,
    setCameraShape,
    setCameraSize,
    setCustomBackgroundImportId,
    setError,
    setExportMessage,
    setImportedMedia,
    setLayoutMode,
    setMasterVolume,
    setProject,
    setScreenAspectRatio,
    setScreenPosition,
    setSpeedEffects,
    setSubtitleLanguage,
    setSubtitleStyle,
    setSubtitles,
    setTimelineSegments,
    setTrimRange,
    setVideoCornerStyle,
    setZoomEffects,
    speedEffects,
    subtitleLanguage,
    subtitleStyle,
    subtitles,
    timelineSegments,
    trimRange,
    videoCornerStyle,
    zoomEffects
  });

  useEffect(() => {
    const customBackground = customBackgroundImportId
      ? importedMedia.find((item) => item.id === customBackgroundImportId)
      : null;
    setCustomBackgroundUrl(customBackground?.url ?? null);
  }, [customBackgroundImportId, importedMedia]);

  // ---------------------------------------------------------------------------
  // Derived data: media library, timeline clips, playback geometry.
  // ---------------------------------------------------------------------------

  const {
    activeDuration,
    activeSubtitle,
    activeVideoClip,
    allMedia,
    audioSources,
    audioTimelineClips,
    audioTimelineTracks,
    cameraEditEnabled,
    cameraStyle,
    cameraVideoStyle,
    currentFrame,
    isProjectCompositionSelected,
    mediaById,
    mediaDurationById,
    playheadPercent,
    previewClassName,
    previewFrameStyle,
    previewItem,
    projectCamera,
    projectMedia,
    projectName,
    projectScreen,
    screenAspectEnabled,
    screenEditEnabled,
    screenStyle,
    selectedItem,
    selectedSubtitle,
    selectedSpeedEffect,
    selectedTimelineClip,
    selectedTimelineItemId,
    selectedZoomEffect,
    timelineDuration,
    timelineEditableItems,
    timelineRenderDuration,
    timelineVisible,
    totalFrames,
    videoTimelineClips,
    visibleMedia
  } = useEditorDerivedData({
    activePanel,
    activeTool,
    backgroundStyle,
    cameraBorderStyle,
    cameraContentTransform,
    cameraFrame,
    cameraPosition,
    cameraShape,
    cameraSize,
    currentTime,
    customBackgroundUrl,
    duration,
    importedMedia,
    layoutMode,
    project,
    screenAspectRatio,
    screenPosition,
    selectedItemId,
    selectedSubtitleId,
    selectedTimelineSegmentId,
    selectedZoomId,
    selectedSpeedId,
    speedEffects,
    subtitles,
    timelineSegments,
    timelineViewDuration,
    videoCornerStyle,
    zoomEffects,
    zoomPreviewTime
  });

  const {
    audioElsRef,
    cameraRef,
    currentTimeRef,
    getAudioLevel,
    mainVideoRef,
    playingRef,
    scheduleTimelinePlaybackSync,
    seek,
    seekFrame,
    syncMediaToTime,
    togglePlayback
  } = useEditorPlayback({
    activeDuration,
    activeVideoClip,
    audioLevels,
    audioTimelineClips,
    currentTime,
    layoutMode,
    masterVolume,
    mediaById,
    playing,
    previewItem,
    projectCamera,
    setCurrentTime,
    setError,
    setPlaying,
    speedEffects,
    subtitles,
    timelineDuration,
    timelineSegments,
    totalFrames,
    zoomEffects
  });

  const {
    beginTimelinePanelResize,
    bodyRef: timelineBodyRef,
    endTimelinePanelResize,
    getTimelineTimeFromClientX,
    moveTimelinePanelResize,
    resetTimelinePanelHeight,
    resetTimelineZoom,
    seekTimelinePointer,
    timelinePanelHeight,
    timelineZoom,
    zoomTimelineIn,
    zoomTimelineOut
  } = useTimelineViewport({
    renderDuration: timelineRenderDuration,
    seek
  });

  const {
    importCustomBackground,
    importMedia,
    removeImportedMedia,
    selectTimelineItem,
    setAudioLevel,
    updateDuration,
    updateMediaDuration
  } = useEditorMediaActions({
    knownTimelineItemIdsRef,
    projectMedia,
    scheduleTimelinePlaybackSync,
    seek,
    setActivePanel,
    setActiveTool,
    setAudioLevels,
    setBackgroundAudioIds,
    setBackgroundStyle,
    customBackgroundImportId,
    setCustomBackgroundImportId,
    setCustomBackgroundUrl,
    setDuration,
    setError,
    setImportedMedia,
    setSelectedItemId,
    setSelectedTimelineSegmentId,
    setTimelineSegments,
    timelineSegments
  });

  const {
    canExport,
    closeExportDialog,
    exportCurrentVideo,
    exportDialogOpen,
    exportFormat,
    exporting,
    exportResolution,
    hasSubtitles,
    openExportDialog,
    setExportFormat,
    setExportResolution
  } = useEditorExport({
    audioLevels,
    backgroundAudioIds,
    masterVolume,
    project,
    projectScreen,
    selectedItem,
    setError,
    setExportMessage,
    subtitles,
    trimRange
  });

  const {
    beginCameraLayoutDrag,
    beginScreenLayoutDrag,
    resetCameraContentTransform,
    selectCameraPosition,
    selectCameraSize,
    updateCameraContentTransform
  } = usePreviewLayoutControls({
    activeTool,
    cameraEditEnabled,
    cameraFrame,
    layoutMode,
    screenEditEnabled,
    screenPosition,
    setCameraContentTransform,
    setCameraFrame,
    setCameraPosition,
    setCameraSize,
    setScreenPosition
  });

  // Everything the timeline does — editing (commit/undo/split/delete), effect
  // regions, subtitle transcription, pointer drags, clipboard, and keyboard
  // shortcuts — is assembled by one controller facade.
  const {
    addSpeedEffect,
    addSubtitle,
    addZoomEffect,
    beginSpeedClipDrag,
    beginSubtitleClipDrag,
    beginTimelineClipMove,
    beginTimelineClipTrim,
    beginTimelineScrub,
    beginZoomClipDrag,
    deleteSelectedTimelineSegment,
    deleteTimelineSegment,
    endTimelineScrub,
    generateSubtitles,
    handleTimelineDragOver,
    handleTimelineDrop,
    moveTimelineScrub,
    openTimelineContextMenu,
    redoTimelineEdit,
    removeSpeedEffect,
    removeZoomEffect,
    splitTimelineSegment,
    sttDownloadProgress,
    sttStatus,
    undoTimelineEdit,
    updateSpeedEffect,
    updateSubtitle,
    updateZoomEffect
  } = useTimelineController({
    activeDuration,
    activeTool,
    allMedia,
    audioElsRef,
    audioSources,
    currentTime,
    currentTimeRef,
    getTimelineTimeFromClientX,
    isEditorStateReady,
    knownTimelineItemIdsRef,
    mediaById,
    mediaDurationById,
    openExportDialog,
    playingRef,
    scheduleTimelinePlaybackSync,
    seek,
    seekTimelinePointer,
    selectedItemId,
    selectedSpeedId,
    selectedTimelineItemId,
    selectedTimelineSegmentId,
    selectedZoomId,
    setActiveTool,
    setError,
    setExportMessage,
    setScrubbingTimeline,
    setSelectedItemId,
    setSelectedSpeedId,
    setSelectedSubtitleId,
    setSelectedTimelineSegmentId,
    setSelectedZoomId,
    setSpeedEffects,
    setSubtitleLanguage,
    setSubtitles,
    setTimelineContextMenu,
    setTimelineSegments,
    setTimelineViewDuration,
    setTrimRange,
    setZoomEffects,
    speedEffects,
    subtitles,
    syncMediaToTime,
    timelineBodyRef,
    timelineDuration,
    timelineEditableItems,
    timelineRenderDuration,
    timelineSegments,
    togglePlayback: () => void togglePlayback(),
    updateMediaDuration,
    zoomEffects
  });

  // ---------------------------------------------------------------------------
  // Render.
  // ---------------------------------------------------------------------------

  return (
    <main className="editor-app grid h-screen min-h-screen overflow-hidden bg-[#0a0a0c] p-0 text-[#f7f7f8]">
      <section
        className="grid h-screen w-screen min-h-0 overflow-hidden bg-[#0a0a0c]"
        style={{
          gridTemplateRows: timelineVisible
            ? `auto minmax(0, 1fr) ${timelinePanelHeight}px`
            : "auto minmax(0, 1fr)"
        }}
      >
        <EditorTopbar
          projectName={projectName}
          exporting={exporting}
          canExport={canExport}
          saving={saving}
          onBackHome={() => void window.openVideoCraft.windows.openMain()}
          onSave={saveState}
          onOpenExport={openExportDialog}
        />

        {exportDialogOpen ? (
          <ExportDialog
            exportFormat={exportFormat}
            exportResolution={exportResolution}
            exporting={exporting}
            hasSubtitles={hasSubtitles}
            onClose={closeExportDialog}
            onExport={() => void exportCurrentVideo()}
            onFormatChange={setExportFormat}
            onResolutionChange={setExportResolution}
          />
        ) : null}
        <EditorNotifications error={error} exportMessage={exportMessage} onDismissError={() => setError(null)} onDismissMessage={() => setExportMessage(null)} />
        {!error && !exportMessage ? <UpdateNotification status={updateStatus} onInstall={() => void installUpdate()} /> : null}

        <div className="grid min-h-0 grid-cols-[432px_minmax(420px,1fr)_320px] gap-3 px-3 py-2">
          <div className="grid min-h-0 min-w-0 grid-cols-[92px_minmax(0,1fr)] overflow-hidden rounded-xl border border-white/[0.07] bg-[#111214] shadow-[0_18px_45px_rgb(0_0_0_/_0.24)]">
            <ToolRail activeTool={activeTool} onToolChange={setActiveTool} />

            <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden p-4">
              <MediaPanel
                activeTab={activePanel}
                visibleMedia={visibleMedia}
                selectedItemId={selectedItem?.id ?? null}
                onImport={() => void importMedia()}
                onTabChange={setActivePanel}
                onSelectItem={selectTimelineItem}
                onItemDuration={updateMediaDuration}
                onRemoveItem={removeImportedMedia}
              />
            </aside>
          </div>

          <EditorToolPanel
            activeTool={activeTool}
            layoutMode={layoutMode}
            screenScale={screenPosition.scale}
            screenAspectRatio={screenAspectRatio}
            screenAspectEnabled={screenAspectEnabled}
            cameraShape={cameraShape}
            cameraBorderStyle={cameraBorderStyle}
            cameraPosition={cameraPosition}
            cameraSize={cameraSize}
            cameraContentTransform={cameraContentTransform}
            masterVolume={masterVolume}
            audioSources={audioSources}
            audioLevels={audioLevels}
            audioPlaying={playing}
            getAudioLevel={getAudioLevel}
            previewItem={previewItem}
            selectedZoomEffect={selectedZoomEffect}
            selectedSpeedEffect={selectedSpeedEffect}
            sttDownloadProgress={sttDownloadProgress}
            sttStatus={sttStatus}
            sttModelLabel={whisperTranscriptionModelLabel}
            subtitleLanguage={formatSubtitleLanguage(subtitleLanguage)}
            subtitleStyle={subtitleStyle}
            subtitles={subtitles}
            selectedSubtitle={selectedSubtitle}
            selectedClip={selectedTimelineClip}
            activeBackgroundCategory={activeBackgroundCategory}
            backgroundStyle={backgroundStyle}
            videoCornerStyle={videoCornerStyle}
            onSelectItem={selectTimelineItem}
            onLayoutModeChange={setLayoutMode}
            onScreenScaleChange={(scale) =>
              setScreenPosition((current) => ({ ...current, scale }))
            }
            onScreenAspectRatioChange={setScreenAspectRatio}
            onCameraShapeChange={setCameraShape}
            onCameraBorderStyleChange={setCameraBorderStyle}
            onCameraPositionChange={selectCameraPosition}
            onCameraSizeChange={selectCameraSize}
            onCameraContentTransformChange={updateCameraContentTransform}
            onCameraContentTransformReset={resetCameraContentTransform}
            onMasterVolumeChange={setMasterVolume}
            onAddBackgroundMusic={() =>
              void importMedia({ backgroundAudio: true, selectFirst: false })
            }
            onSetAudioLevel={setAudioLevel}
            onAddZoom={addZoomEffect}
            onUpdateZoom={updateZoomEffect}
            onRemoveZoom={removeZoomEffect}
            onPreviewZoomCurve={(effect, progress) =>
              setZoomPreviewTime(
                progress === null ? null : getZoomPreviewTime(effect, progress)
              )
            }
            onAddSpeed={addSpeedEffect}
            onUpdateSpeed={updateSpeedEffect}
            onRemoveSpeed={removeSpeedEffect}
            onAddSubtitle={addSubtitle}
            onGenerateSubtitles={() => void generateSubtitles()}
            onSubtitleStyleChange={setSubtitleStyle}
            onUpdateSubtitle={updateSubtitle}
            onSelectSubtitle={setSelectedSubtitleId}
            onSplitAtPlayhead={() =>
              splitTimelineSegment(selectedTimelineSegmentId, currentTime)
            }
            onDeleteSelected={deleteSelectedTimelineSegment}
            onBackgroundCategoryChange={setActiveBackgroundCategory}
            onBackgroundStyleChange={setBackgroundStyle}
            onUploadCustomBackground={() => void importCustomBackground()}
            onCornerStyleChange={setVideoCornerStyle}
          />

          <EditorPreviewPanel
            previewClassName={previewClassName}
            previewFrameStyle={previewFrameStyle}
            previewZoom={previewZoom}
            previewItem={previewItem}
            videoTimelineClips={videoTimelineClips}
            audioTimelineClips={audioTimelineClips}
            isProjectCompositionSelected={isProjectCompositionSelected}
            projectCamera={projectCamera}
            layoutMode={layoutMode}
            screenStyle={screenStyle}
            cameraStyle={cameraStyle}
            cameraVideoStyle={cameraVideoStyle}
            screenEditEnabled={screenEditEnabled}
            cameraEditEnabled={cameraEditEnabled}
            activeSubtitle={activeSubtitle}
            subtitleStyle={subtitleStyle}
            currentTime={currentTime}
            playing={playing}
            currentFrame={currentFrame}
            totalFrames={totalFrames}
            onTogglePlayback={() => void togglePlayback()}
            onSeekFrame={seekFrame}
            mainVideoRef={mainVideoRef}
            cameraRef={cameraRef}
            audioElsRef={audioElsRef}
            onScreenEditPointerDown={beginScreenLayoutDrag}
            onCameraEditPointerDown={beginCameraLayoutDrag}
            onMediaReady={() =>
              syncMediaToTime(currentTimeRef.current, playingRef.current, "media-ready")
            }
            onDuration={updateDuration}
            onMediaDuration={updateMediaDuration}
            onPreviewZoomChange={(zoom) => setPreviewZoom(clampNumber(zoom, 0.65, 1.6))}
            onSubtitleClick={(subtitleId) => {
              setSelectedSubtitleId(subtitleId);
              setActiveTool("subtitles");
            }}
          />
        </div>

        <EditorTimelineSection
          visible={timelineVisible}
          bodyRef={timelineBodyRef}
          onResizePointerDown={beginTimelinePanelResize}
          onResizePointerMove={moveTimelinePanelResize}
          onResizePointerUp={endTimelinePanelResize}
          onResizeDoubleClick={resetTimelinePanelHeight}
          timelineZoom={timelineZoom}
          onZoomIn={zoomTimelineIn}
          onZoomOut={zoomTimelineOut}
          onZoomReset={resetTimelineZoom}
          activeTool={activeTool}
          playing={playing}
          scrubbing={scrubbingTimeline}
          currentTime={currentTime}
          currentFrame={currentFrame}
          totalFrames={totalFrames}
          playheadPercent={playheadPercent}
          renderDuration={timelineRenderDuration}
          videoClips={videoTimelineClips}
          audioTracks={audioTimelineTracks}
          audioLevels={audioLevels}
          zoomEffects={zoomEffects}
          speedEffects={speedEffects}
          subtitles={subtitles}
          selectedSegmentId={selectedTimelineSegmentId}
          selectedZoomId={selectedZoomEffect?.id ?? null}
          selectedSpeedId={selectedSpeedEffect?.id ?? null}
          selectedSubtitleId={selectedSubtitle?.id ?? null}
          contextMenu={timelineContextMenu}
          canSplitAtContextMenu={
            timelineContextMenu
              ? canSplitTimelineSegmentAt(timelineSegments, timelineContextMenu)
              : false
          }
          onTogglePlayback={() => void togglePlayback()}
          onSeekFrame={seekFrame}
          onUndo={undoTimelineEdit}
          onRedo={redoTimelineEdit}
          onSplitAtPlayhead={() =>
            splitTimelineSegment(selectedTimelineSegmentId, currentTime)
          }
          onDeleteSelected={deleteSelectedTimelineSegment}
          onSelectClip={(clip) => {
            setSelectedItemId(clip.item.id);
            setSelectedTimelineSegmentId(clip.id);
          }}
          onSelectZoom={(effect) => {
            setSelectedZoomId(effect.id);
            setActiveTool("zoom");
            seek((effect.start + effect.end) / 2);
          }}
          onSelectSpeed={(effect) => {
            setSelectedSpeedId(effect.id);
            setActiveTool("speed");
            seek((effect.start + effect.end) / 2);
          }}
          onSelectSubtitle={(subtitleId) => {
            setSelectedSubtitleId(subtitleId);
            setActiveTool("subtitles");
          }}
          onTrimPointerDown={beginTimelineClipTrim}
          onMovePointerDown={beginTimelineClipMove}
          onZoomDragPointerDown={beginZoomClipDrag}
          onSpeedDragPointerDown={beginSpeedClipDrag}
          onSubtitleDragPointerDown={beginSubtitleClipDrag}
          onBodyPointerDown={beginTimelineScrub}
          onBodyPointerMove={moveTimelineScrub}
          onBodyPointerUp={endTimelineScrub}
          onBodyContextMenu={openTimelineContextMenu}
          onBodyDragOver={handleTimelineDragOver}
          onBodyDrop={handleTimelineDrop}
          onContextMenuSplit={() => {
            if (timelineContextMenu) {
              splitTimelineSegment(timelineContextMenu.segmentId, timelineContextMenu.time);
            }
          }}
          onContextMenuDelete={() => {
            if (timelineContextMenu) {
              deleteTimelineSegment(timelineContextMenu.segmentId);
            }
          }}
        />
      </section>
    </main>
  );
}
