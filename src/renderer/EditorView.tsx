import {
  AudioLines,
  Captions,
  CircleStop,
  Combine,
  Download,
  Film,
  FolderOpen,
  LayoutTemplate,
  Maximize2,
  Monitor,
  Move,
  Music2,
  Palette,
  PictureInPicture2,
  Play,
  Plus,
  Scissors,
  Settings2,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Trash2,
  Upload,
  Volume2,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import type {
  ExportResolution,
  ExportVideoFormat,
  ExportVideoRequest,
  ImportedMediaFile,
  ImportedMediaKind,
  ProjectView
} from "../shared/types";

type MediaPanel = "all" | "video" | "audio" | "image";
type EditorTool = "media" | "layout" | "audio" | "zoom" | "subtitles" | "cut" | "style";
type LayoutMode = "fill" | "fit" | "bubble" | "portrait" | "split";
type BackgroundStyle = "forest" | "soft-light" | "midnight" | "paper";
type ZoomDirection = "in" | "out";

type EditorMediaItem = {
  id: string;
  name: string;
  url: string;
  kind: ImportedMediaKind;
  origin: "project" | "imported";
  track: "screen" | "camera" | "audio" | "imported";
  duration: number | null;
  importId?: string;
};

type ZoomEffect = {
  id: string;
  start: number;
  end: number;
  direction: ZoomDirection;
  intensity: number;
};

type SubtitleSegment = {
  id: string;
  start: number;
  end: number;
  text: string;
};

const frameRate = 30;

const editorTools: Array<{
  id: EditorTool;
  label: string;
  icon: ReactNode;
}> = [
  { id: "media", label: "Media", icon: <FolderOpen size={18} /> },
  { id: "layout", label: "Layout", icon: <LayoutTemplate size={18} /> },
  { id: "audio", label: "Audio", icon: <Volume2 size={18} /> },
  { id: "zoom", label: "Zoom", icon: <ZoomIn size={18} /> },
  { id: "subtitles", label: "Subtitles", icon: <Captions size={18} /> },
  { id: "cut", label: "Cut", icon: <Scissors size={18} /> },
  { id: "style", label: "Style", icon: <Palette size={18} /> }
];

const layoutOptions: Array<{
  id: LayoutMode;
  label: string;
  icon: ReactNode;
}> = [
  { id: "fill", label: "Fill", icon: <Maximize2 size={17} /> },
  { id: "fit", label: "Fit", icon: <Monitor size={17} /> },
  { id: "bubble", label: "Face Bubble", icon: <PictureInPicture2 size={17} /> },
  { id: "portrait", label: "Presenter", icon: <Move size={17} /> },
  { id: "split", label: "Side by Side", icon: <Combine size={17} /> }
];

const backgroundOptions: Array<{
  id: BackgroundStyle;
  label: string;
}> = [
  { id: "forest", label: "Forest" },
  { id: "soft-light", label: "Soft Light" },
  { id: "midnight", label: "Midnight" },
  { id: "paper", label: "Paper" }
];

const exportFormats: ExportVideoFormat[] = ["mp4", "webm", "mov"];
const exportResolutions: ExportResolution[] = ["source", "720p", "1080p", "1440p"];

export function EditorView() {
  const projectId = useMemo(
    () => new URLSearchParams(window.location.search).get("projectId"),
    []
  );
  const [project, setProject] = useState<ProjectView | null>(null);
  const [importedMedia, setImportedMedia] = useState<EditorMediaItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<MediaPanel>("all");
  const [activeTool, setActiveTool] = useState<EditorTool>("layout");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("fit");
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>("forest");
  const [screenPosition, setScreenPosition] = useState({
    x: 0,
    y: 0,
    scale: 88
  });
  const [cameraSize, setCameraSize] = useState(24);
  const [audioVolume, setAudioVolume] = useState(100);
  const [backgroundAudioIds, setBackgroundAudioIds] = useState<string[]>([]);
  const [zoomDirection, setZoomDirection] = useState<ZoomDirection>("in");
  const [zoomEffects, setZoomEffects] = useState<ZoomEffect[]>([]);
  const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null);
  const [subtitles, setSubtitles] = useState<SubtitleSegment[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [trimRange, setTrimRange] = useState({ start: 0, end: 0 });
  const [exportFormat, setExportFormat] = useState<ExportVideoFormat>("mp4");
  const [exportResolution, setExportResolution] = useState<ExportResolution>("1080p");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const screenRef = useRef<HTMLVideoElement | null>(null);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const projectAudioRef = useRef<HTMLAudioElement | null>(null);
  const importedVideoRef = useRef<HTMLVideoElement | null>(null);
  const importedAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    void window.openVideoCraft.projects
      .get(projectId)
      .then(setProject)
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      });
  }, [projectId]);

  const projectMedia = useMemo(() => createProjectMedia(project), [project]);
  const allMedia = useMemo(
    () => [...projectMedia, ...importedMedia],
    [importedMedia, projectMedia]
  );
  const selectedItem =
    allMedia.find((item) => item.id === selectedItemId) ?? allMedia[0] ?? null;
  const visibleMedia = allMedia.filter((item) =>
    activePanel === "all" ? true : item.kind === activePanel
  );
  const projectName = project?.name ?? "New Edit";
  const projectScreen = projectMedia.find((item) => item.track === "screen") ?? null;
  const projectCamera = projectMedia.find((item) => item.track === "camera") ?? null;
  const projectAudio = projectMedia.find((item) => item.track === "audio") ?? null;
  const isProjectCompositionSelected = Boolean(
    projectScreen && selectedItem?.origin === "project"
  );
  const previewItem = isProjectCompositionSelected ? projectScreen : selectedItem;
  const activeDuration =
    duration > 0 ? duration : selectedItem?.duration ?? (project?.durationMs ?? 0) / 1000;
  const totalFrames = Math.max(1, Math.floor(activeDuration * frameRate));
  const currentFrame = Math.min(totalFrames, Math.max(0, Math.round(currentTime * frameRate)));
  const playheadPercent =
    activeDuration > 0 ? Math.min(100, Math.max(0, (currentTime / activeDuration) * 100)) : 0;
  const activeZoom = getActiveZoom(zoomEffects, currentTime);
  const activeSubtitle =
    subtitles.find((subtitle) => currentTime >= subtitle.start && currentTime <= subtitle.end) ??
    null;
  const selectedSubtitle =
    subtitles.find((subtitle) => subtitle.id === selectedSubtitleId) ?? subtitles[0] ?? null;
  const selectedZoomEffect =
    zoomEffects.find((effect) => effect.id === selectedZoomId) ?? zoomEffects[0] ?? null;
  const backgroundAudioItems = importedMedia.filter((item) =>
    backgroundAudioIds.includes(item.id)
  );
  const screenScale =
    layoutMode === "fill" || layoutMode === "split"
      ? activeZoom.scale
      : (screenPosition.scale / 100) * activeZoom.scale;
  const screenStyle: CSSProperties =
    layoutMode === "fill"
      ? {
          transform: `scale(${screenScale.toFixed(3)})`
        }
      : {
          transform: `translate(${screenPosition.x}%, ${screenPosition.y}%) scale(${screenScale.toFixed(
            3
          )})`
        };
  const previewFrameStyle = {
    "--camera-size": `${cameraSize}%`
  } as CSSProperties;
  const previewClassName = [
    "preview-composition-frame",
    `preview-layout-${layoutMode}`,
    layoutMode === "fill" ? "preview-style-none" : `preview-style-${backgroundStyle}`
  ].join(" ");

  useEffect(() => {
    if (!selectedItemId && allMedia.length > 0) {
      setSelectedItemId(allMedia[0].id);
    }
  }, [allMedia, selectedItemId]);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(selectedItem?.duration ?? 0);
    setPlaying(false);
  }, [selectedItem?.id, selectedItem?.duration]);

  useEffect(() => {
    if (activeDuration <= 0) {
      return;
    }

    setTrimRange((current) => ({
      start: Math.min(current.start, activeDuration),
      end:
        current.end > 0
          ? Math.min(Math.max(current.end, current.start), activeDuration)
          : activeDuration
    }));
  }, [activeDuration]);

  useEffect(() => {
    const nextVolume = Math.min(1, Math.max(0, audioVolume / 100));

    for (const element of compactMediaElements([
      screenRef.current,
      cameraRef.current,
      projectAudioRef.current,
      importedVideoRef.current,
      importedAudioRef.current
    ])) {
      element.volume = nextVolume;
    }
  }, [audioVolume, selectedItem?.id]);

  async function importMedia(options: {
    backgroundAudio?: boolean;
    selectFirst?: boolean;
  } = {}) {
    const files = await window.openVideoCraft.editor.importMedia();
    if (files.length === 0) {
      return;
    }

    const nextItems = files.map(toEditorMediaItem);
    setImportedMedia((current) => [...current, ...nextItems]);

    if (options.backgroundAudio) {
      const audioIds = nextItems
        .filter((item) => item.kind === "audio")
        .map((item) => item.id);
      setBackgroundAudioIds((current) => [...new Set([...current, ...audioIds])]);
      setActiveTool("audio");
    }

    if (options.selectFirst ?? true) {
      setSelectedItemId(nextItems[0].id);
    }

    setActivePanel("all");
  }

  function removeImportedMedia(itemId: string) {
    void window.openVideoCraft.editor.removeImportedMedia(itemId);
    setImportedMedia((current) => current.filter((item) => item.id !== itemId));
    setBackgroundAudioIds((current) => current.filter((id) => id !== itemId));
    setSelectedItemId((current) => (current === itemId ? projectMedia[0]?.id ?? null : current));
  }

  function mediaElements(): HTMLMediaElement[] {
    if (!selectedItem) {
      return [];
    }

    if (isProjectCompositionSelected) {
      return compactMediaElements([
        screenRef.current,
        cameraRef.current,
        projectAudioRef.current
      ]);
    }

    if (selectedItem.kind === "audio") {
      return compactMediaElements([importedAudioRef.current]);
    }

    if (selectedItem.kind === "video") {
      return compactMediaElements([importedVideoRef.current]);
    }

    return [];
  }

  async function togglePlayback() {
    const elements = mediaElements();

    if (playing) {
      elements.forEach((element) => element.pause());
      setPlaying(false);
      return;
    }

    if (elements.length === 0) {
      return;
    }

    elements.forEach((element) => {
      element.currentTime = currentTime;
      element.volume = Math.min(1, Math.max(0, audioVolume / 100));
    });
    await Promise.all(elements.map((element) => element.play()));
    setPlaying(true);
  }

  function seek(value: number) {
    const nextTime = Math.max(0, Math.min(value, activeDuration || value));
    setCurrentTime(nextTime);
    mediaElements().forEach((element) => {
      element.currentTime = nextTime;
    });
  }

  function seekFrame(frame: number) {
    const nextFrame = Math.max(0, Math.min(frame, totalFrames));
    seek(nextFrame / frameRate);
  }

  function updateDuration(value: number | null) {
    if (value && Number.isFinite(value)) {
      setDuration(value);
    }
  }

  function addZoomEffect() {
    const start = currentTime;
    const end = activeDuration > 0 ? Math.min(activeDuration, start + 2.5) : start + 2.5;
    const nextEffect: ZoomEffect = {
      id: `zoom-${Date.now()}`,
      start,
      end: Math.max(start + 0.5, end),
      direction: zoomDirection,
      intensity: 0.28
    };
    setZoomEffects((current) => [...current, nextEffect]);
    setSelectedZoomId(nextEffect.id);
    setActiveTool("zoom");
  }

  function updateZoomEffect(id: string, updates: Partial<ZoomEffect>) {
    setZoomEffects((current) =>
      current.map((effect) => (effect.id === id ? { ...effect, ...updates } : effect))
    );
  }

  function removeZoomEffect(id: string) {
    setZoomEffects((current) => current.filter((effect) => effect.id !== id));
    setSelectedZoomId((current) => (current === id ? null : current));
  }

  function addSubtitle() {
    const start = currentTime;
    const end = activeDuration > 0 ? Math.min(activeDuration, start + 3) : start + 3;
    const nextSubtitle: SubtitleSegment = {
      id: `subtitle-${Date.now()}`,
      start,
      end: Math.max(start + 0.5, end),
      text: "New subtitle"
    };
    setSubtitles((current) => [...current, nextSubtitle]);
    setSelectedSubtitleId(nextSubtitle.id);
    setActiveTool("subtitles");
  }

  function updateSubtitle(id: string, updates: Partial<SubtitleSegment>) {
    setSubtitles((current) =>
      current.map((subtitle) => (subtitle.id === id ? { ...subtitle, ...updates } : subtitle))
    );
  }

  function getExportSource(): ExportVideoRequest["source"] | null {
    if (selectedItem?.origin === "imported" && selectedItem.kind === "video") {
      return {
        kind: "import",
        importId: selectedItem.importId ?? selectedItem.id
      };
    }

    if (project && projectScreen) {
      return {
        kind: "project",
        projectId: project.id
      };
    }

    return null;
  }

  async function exportCurrentVideo() {
    const source = getExportSource();

    if (!source) {
      setError("Select a video clip before exporting.");
      return;
    }

    setError(null);
    setExportMessage(null);
    setExporting(true);

    try {
      const result = await window.openVideoCraft.editor.exportVideo({
        source,
        format: exportFormat,
        resolution: exportResolution,
        trimStart: trimRange.start,
        trimEnd: trimRange.end > trimRange.start ? trimRange.end : null,
        volume: audioVolume / 100,
        backgroundAudioImportIds: backgroundAudioIds
      });

      if (result) {
        setExportMessage(`Exported ${formatBytes(result.bytesWritten)} to ${result.path}`);
        setExportDialogOpen(false);
      }
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="editor-root">
      <section className="studio-shell">
        <header className="studio-topbar">
          <div className="studio-brand">
            <div className="studio-brand-mark">
              <span />
              <span />
              <span />
            </div>
            <div>
              <strong>Open Video Craft</strong>
              <small>Video Editor</small>
            </div>
          </div>

          <button className="studio-project-select" type="button">
            <span>{projectName}</span>
          </button>

          <div className="studio-top-actions">
            <button className="studio-icon-button" type="button" title="Settings">
              <Settings2 size={17} />
            </button>
            <button
              className="studio-export-button"
              type="button"
              disabled={exporting || !getExportSource()}
              onClick={() => setExportDialogOpen(true)}
            >
              <Download size={16} />
              Export
            </button>
          </div>
        </header>

        {exportDialogOpen ? (
          <ExportDialog
            exportFormat={exportFormat}
            exportResolution={exportResolution}
            exporting={exporting}
            onClose={() => {
              if (!exporting) {
                setExportDialogOpen(false);
              }
            }}
            onExport={() => void exportCurrentVideo()}
            onFormatChange={setExportFormat}
            onResolutionChange={setExportResolution}
          />
        ) : null}

        {error ? <div className="studio-error">{error}</div> : null}
        {exportMessage ? <div className="studio-success">{exportMessage}</div> : null}

        <div className="studio-workspace">
          <aside className="studio-rail" aria-label="Editor tools">
            {editorTools.map((tool) => (
              <button
                className={activeTool === tool.id ? "studio-rail-active" : ""}
                type="button"
                title={tool.label}
                key={tool.id}
                onClick={() => setActiveTool(tool.id)}
              >
                {tool.icon}
                <span>{tool.label}</span>
              </button>
            ))}
          </aside>

          <aside className="tool-panel">
            <ToolPanelHeader
              icon={editorTools.find((tool) => tool.id === activeTool)?.icon}
              title={editorTools.find((tool) => tool.id === activeTool)?.label ?? "Tools"}
            />

            {activeTool === "media" ? (
              <>
                <button
                  className="import-button"
                  type="button"
                  onClick={() => void importMedia()}
                >
                  <Upload size={15} />
                  Import media
                </button>
                <div className="media-tabs">
                  {(["all", "video", "audio", "image"] as MediaPanel[]).map((panel) => (
                    <button
                      className={activePanel === panel ? "media-tab-active" : ""}
                      type="button"
                      key={panel}
                      onClick={() => setActivePanel(panel)}
                    >
                      {panel === "all" ? "All" : panel}
                    </button>
                  ))}
                </div>

                <div className="asset-grid">
                  {visibleMedia.map((item) => (
                    <AssetCard
                      key={item.id}
                      item={item}
                      selected={selectedItem?.id === item.id}
                      onSelect={() => setSelectedItemId(item.id)}
                      onRemove={
                        item.origin === "imported" ? () => removeImportedMedia(item.id) : undefined
                      }
                    />
                  ))}
                </div>

                {visibleMedia.length === 0 ? (
                  <div className="media-empty">
                    <Plus size={18} />
                    <span>Import media or finish a recording to begin editing.</span>
                  </div>
                ) : null}
              </>
            ) : null}

            {activeTool === "layout" ? (
              <div className="tool-stack">
                <div className="layout-option-grid">
                  {layoutOptions.map((option) => (
                    <button
                      className={layoutMode === option.id ? "tool-option-active" : ""}
                      type="button"
                      key={option.id}
                      onClick={() => setLayoutMode(option.id)}
                    >
                      {option.icon}
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>

                <RangeControl
                  label="Horizontal"
                  min={-36}
                  max={36}
                  value={screenPosition.x}
                  suffix="%"
                  onChange={(value) =>
                    setScreenPosition((current) => ({ ...current, x: value }))
                  }
                />
                <RangeControl
                  label="Vertical"
                  min={-28}
                  max={28}
                  value={screenPosition.y}
                  suffix="%"
                  onChange={(value) =>
                    setScreenPosition((current) => ({ ...current, y: value }))
                  }
                />
                <RangeControl
                  label="Video scale"
                  min={60}
                  max={126}
                  value={screenPosition.scale}
                  suffix="%"
                  onChange={(value) =>
                    setScreenPosition((current) => ({ ...current, scale: value }))
                  }
                />
                <RangeControl
                  label="Face size"
                  min={14}
                  max={42}
                  value={cameraSize}
                  suffix="%"
                  onChange={setCameraSize}
                />
              </div>
            ) : null}

            {activeTool === "audio" ? (
              <div className="tool-stack">
                <RangeControl
                  label="Clip volume"
                  min={0}
                  max={200}
                  value={audioVolume}
                  suffix="%"
                  onChange={setAudioVolume}
                />
                <button
                  className="secondary-tool-button"
                  type="button"
                  onClick={() => void importMedia({ backgroundAudio: true, selectFirst: false })}
                >
                  <Music2 size={16} />
                  Add background music
                </button>
                <div className="tool-list">
                  {backgroundAudioItems.map((item) => (
                    <button
                      className="tool-list-item"
                      type="button"
                      key={item.id}
                      onClick={() => setSelectedItemId(item.id)}
                    >
                      <AudioLines size={15} />
                      <span>{item.name}</span>
                    </button>
                  ))}
                  {backgroundAudioItems.length === 0 ? (
                    <div className="tool-empty">No background audio</div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {activeTool === "zoom" ? (
              <div className="tool-stack">
                <div className="segmented-control">
                  <button
                    className={zoomDirection === "in" ? "segmented-active" : ""}
                    type="button"
                    onClick={() => setZoomDirection("in")}
                  >
                    <ZoomIn size={15} />
                    In
                  </button>
                  <button
                    className={zoomDirection === "out" ? "segmented-active" : ""}
                    type="button"
                    onClick={() => setZoomDirection("out")}
                  >
                    <ZoomOut size={15} />
                    Out
                  </button>
                </div>
                <button className="secondary-tool-button" type="button" onClick={addZoomEffect}>
                  <WandSparkles size={16} />
                  Add smooth zoom
                </button>
                <div className="trim-summary">
                  <WandSparkles size={16} />
                  <span>{zoomEffects.length} timeline zooms</span>
                </div>
              </div>
            ) : null}

            {activeTool === "subtitles" ? (
              <div className="tool-stack">
                <button className="secondary-tool-button" type="button" onClick={addSubtitle}>
                  <Captions size={16} />
                  Add subtitle
                </button>
                {selectedSubtitle ? (
                  <div className="subtitle-editor">
                    <textarea
                      value={selectedSubtitle.text}
                      onChange={(event) =>
                        updateSubtitle(selectedSubtitle.id, { text: event.target.value })
                      }
                    />
                    <div className="time-input-grid">
                      <label>
                        <span>Start</span>
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          value={selectedSubtitle.start}
                          onChange={(event) =>
                            updateSubtitle(selectedSubtitle.id, {
                              start: Number(event.target.value)
                            })
                          }
                        />
                      </label>
                      <label>
                        <span>End</span>
                        <input
                          type="number"
                          min={selectedSubtitle.start + 0.1}
                          step={0.1}
                          value={selectedSubtitle.end}
                          onChange={(event) =>
                            updateSubtitle(selectedSubtitle.id, {
                              end: Number(event.target.value)
                            })
                          }
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="tool-empty">No subtitles</div>
                )}
                <div className="tool-list">
                  {subtitles.map((subtitle) => (
                    <button
                      className={`tool-list-item ${
                        selectedSubtitle?.id === subtitle.id ? "tool-list-item-active" : ""
                      }`}
                      type="button"
                      key={subtitle.id}
                      onClick={() => setSelectedSubtitleId(subtitle.id)}
                    >
                      <Captions size={15} />
                      <span>{subtitle.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {activeTool === "cut" ? (
              <div className="tool-stack">
                <div className="trim-summary">
                  <Scissors size={16} />
                  <span>
                    {formatSeconds(trimRange.start)} - {formatSeconds(trimRange.end)}
                  </span>
                </div>
              </div>
            ) : null}

            {activeTool === "style" ? (
              <div className="tool-stack">
                <div className="style-grid">
                  {backgroundOptions.map((option) => (
                    <button
                      className={`style-swatch style-swatch-${option.id} ${
                        backgroundStyle === option.id ? "style-swatch-active" : ""
                      }`}
                      type="button"
                      key={option.id}
                      disabled={layoutMode === "fill"}
                      onClick={() => setBackgroundStyle(option.id)}
                    >
                      <span />
                      <strong>{option.label}</strong>
                    </button>
                  ))}
                </div>
                {layoutMode === "fill" ? (
                  <div className="tool-empty">Fill layout has no background style.</div>
                ) : null}
              </div>
            ) : null}
          </aside>

          <section className="preview-panel">
            <div className="preview-canvas">
              <div className={previewClassName} style={previewFrameStyle}>
                {previewItem ? (
                  <PreviewContent
                    item={previewItem}
                    isProjectCompositionSelected={isProjectCompositionSelected}
                    projectCamera={projectCamera}
                    projectAudio={projectAudio}
                    layoutMode={layoutMode}
                    screenStyle={screenStyle}
                    activeSubtitle={activeSubtitle}
                    screenRef={screenRef}
                    cameraRef={cameraRef}
                    projectAudioRef={projectAudioRef}
                    importedVideoRef={importedVideoRef}
                    importedAudioRef={importedAudioRef}
                    onDuration={updateDuration}
                    onTimeUpdate={setCurrentTime}
                    onEnded={() => setPlaying(false)}
                    onSubtitleClick={(subtitleId) => {
                      setSelectedSubtitleId(subtitleId);
                      setActiveTool("subtitles");
                    }}
                  />
                ) : (
                  <div className="studio-video-empty">Import media or record a screen.</div>
                )}
              </div>
            </div>
          </section>
        </div>

        <section className="timeline-panel">
          <div className="timeline-toolbar">
            <div className="timeline-toolset timeline-playback">
              <button type="button" onClick={() => seekFrame(currentFrame - 1)} title="Previous frame">
                <SkipBack size={14} />
              </button>
              <button type="button" onClick={() => void togglePlayback()} title="Play">
                {playing ? <CircleStop size={15} /> : <Play size={15} />}
              </button>
              <button type="button" onClick={() => seekFrame(currentFrame + 1)} title="Next frame">
                <SkipForward size={14} />
              </button>
              <span>{formatTimecode(currentTime, currentFrame)}</span>
            </div>

            <input
              className="frame-scrubber"
              type="range"
              min={0}
              max={totalFrames}
              step={1}
              value={currentFrame}
              onChange={(event) => seekFrame(Number(event.target.value))}
            />

            <div className="timeline-status">
              <SlidersHorizontal size={14} />
              <span>
                {currentFrame} / {totalFrames}
              </span>
            </div>
          </div>

          <TimelineEditStrip
            activeTool={activeTool}
            activeDuration={activeDuration}
            trimRange={trimRange}
            selectedZoomEffect={selectedZoomEffect}
            onAddMergeClip={() => void importMedia({ selectFirst: false })}
            onRemoveZoom={removeZoomEffect}
            onTrimEndChange={(value) =>
              setTrimRange((current) => ({ ...current, end: Math.max(value, current.start) }))
            }
            onTrimStartChange={(value) =>
              setTrimRange((current) => ({
                ...current,
                start: Math.min(value, current.end || activeDuration)
              }))
            }
            onZoomChange={updateZoomEffect}
          />

          <div className="timeline-ruler">
            {createTimelineTicks(activeDuration).map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>

          <div className="timeline-body">
            <div
              className="playhead"
              style={{ left: `calc(150px + (${playheadPercent} * (100% - 150px) / 100))` }}
            >
              <span />
            </div>
            <TimelineTrack label="Video 1" accent="purple" icon={<Film size={14} />}>
              {allMedia
                .filter((item) => item.kind === "video" || item.kind === "image")
                .map((item) => (
                  <TimelineClip
                    key={item.id}
                    item={item}
                    selected={selectedItem?.id === item.id}
                    onSelect={() => setSelectedItemId(item.id)}
                  />
                ))}
            </TimelineTrack>

            <TimelineTrack label="Zoom" accent="amber" icon={<WandSparkles size={14} />}>
              {zoomEffects.map((effect) => (
                <TimelineZoomClip
                  key={effect.id}
                  effect={effect}
                  duration={activeDuration}
                  selected={selectedZoomEffect?.id === effect.id}
                  onSelect={() => {
                    setSelectedZoomId(effect.id);
                    setActiveTool("zoom");
                  }}
                />
              ))}
            </TimelineTrack>

            <TimelineTrack label="Cut" accent="rose" icon={<Scissors size={14} />}>
              <TimelineTrimClip
                duration={activeDuration}
                range={trimRange}
                selected={activeTool === "cut"}
                onSelect={() => setActiveTool("cut")}
              />
            </TimelineTrack>

            <TimelineTrack label="Audio 1" accent="green" icon={<AudioLines size={14} />}>
              {allMedia
                .filter((item) => item.kind === "audio")
                .map((item) => (
                  <TimelineClip
                    key={item.id}
                    item={item}
                    selected={selectedItem?.id === item.id}
                    onSelect={() => setSelectedItemId(item.id)}
                  />
                ))}
            </TimelineTrack>

            <TimelineTrack label="Subtitles" accent="cyan" icon={<Captions size={14} />}>
              {subtitles.map((subtitle) => (
                <TimelineSubtitleClip
                  key={subtitle.id}
                  subtitle={subtitle}
                  duration={activeDuration}
                  selected={selectedSubtitle?.id === subtitle.id}
                  onSelect={() => {
                    setSelectedSubtitleId(subtitle.id);
                    setActiveTool("subtitles");
                  }}
                />
              ))}
            </TimelineTrack>
          </div>
        </section>
      </section>
    </main>
  );
}

function ToolPanelHeader(props: { icon: ReactNode; title: string }) {
  return (
    <div className="tool-panel-header">
      <span>{props.icon}</span>
      <strong>{props.title}</strong>
    </div>
  );
}

function ExportDialog(props: {
  exportFormat: ExportVideoFormat;
  exportResolution: ExportResolution;
  exporting: boolean;
  onClose: () => void;
  onExport: () => void;
  onFormatChange: (format: ExportVideoFormat) => void;
  onResolutionChange: (resolution: ExportResolution) => void;
}) {
  return (
    <div className="export-dialog-backdrop" role="presentation">
      <section className="export-dialog" role="dialog" aria-modal="true" aria-label="Export video">
        <div className="export-dialog-header">
          <strong>Export video</strong>
          <button type="button" onClick={props.onClose} disabled={props.exporting}>
            <X size={16} />
          </button>
        </div>
        <label>
          <span>Resolution</span>
          <select
            value={props.exportResolution}
            onChange={(event) =>
              props.onResolutionChange(event.target.value as ExportResolution)
            }
            disabled={props.exporting}
          >
            {exportResolutions.map((resolution) => (
              <option key={resolution} value={resolution}>
                {resolution === "source" ? "Source" : resolution}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Format</span>
          <select
            value={props.exportFormat}
            onChange={(event) => props.onFormatChange(event.target.value as ExportVideoFormat)}
            disabled={props.exporting}
          >
            {exportFormats.map((format) => (
              <option key={format} value={format}>
                {format.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <div className="export-dialog-actions">
          <button type="button" onClick={props.onClose} disabled={props.exporting}>
            Cancel
          </button>
          <button type="button" onClick={props.onExport} disabled={props.exporting}>
            <Download size={15} />
            {props.exporting ? "Exporting" : "Export"}
          </button>
        </div>
      </section>
    </div>
  );
}

function RangeControl(props: {
  label: string;
  min: number;
  max: number;
  value: number;
  suffix?: string;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-control">
      <span>
        {props.label}
        <output>
          {props.value}
          {props.suffix}
        </output>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </label>
  );
}

function PreviewContent(props: {
  item: EditorMediaItem;
  isProjectCompositionSelected: boolean;
  projectCamera: EditorMediaItem | null;
  projectAudio: EditorMediaItem | null;
  layoutMode: LayoutMode;
  screenStyle: CSSProperties;
  activeSubtitle: SubtitleSegment | null;
  screenRef: RefObject<HTMLVideoElement | null>;
  cameraRef: RefObject<HTMLVideoElement | null>;
  projectAudioRef: RefObject<HTMLAudioElement | null>;
  importedVideoRef: RefObject<HTMLVideoElement | null>;
  importedAudioRef: RefObject<HTMLAudioElement | null>;
  onDuration: (duration: number | null) => void;
  onTimeUpdate: (time: number) => void;
  onEnded: () => void;
  onSubtitleClick: (subtitleId: string) => void;
}) {
  if (props.item.kind === "image") {
    return (
      <>
        <img className="studio-screen-video" style={props.screenStyle} src={props.item.url} alt="" />
        <SubtitleOverlay subtitle={props.activeSubtitle} onClick={props.onSubtitleClick} />
      </>
    );
  }

  if (props.item.kind === "audio") {
    return (
      <div className="audio-preview">
        <AudioLines size={44} />
        <strong>{props.item.name}</strong>
        <audio
          ref={props.importedAudioRef}
          src={props.item.url}
          onLoadedMetadata={(event) => props.onDuration(event.currentTarget.duration)}
          onTimeUpdate={(event) => props.onTimeUpdate(event.currentTarget.currentTime)}
          onEnded={props.onEnded}
        />
      </div>
    );
  }

  if (props.isProjectCompositionSelected) {
    return (
      <>
        <video
          ref={props.screenRef}
          className="studio-screen-video"
          style={props.screenStyle}
          src={props.item.url}
          playsInline
          onLoadedMetadata={(event) => props.onDuration(event.currentTarget.duration)}
          onTimeUpdate={(event) => props.onTimeUpdate(event.currentTarget.currentTime)}
          onEnded={props.onEnded}
        />
        {props.projectCamera && props.layoutMode !== "fit" && props.layoutMode !== "fill" ? (
          <video
            ref={props.cameraRef}
            className="studio-camera-video"
            src={props.projectCamera.url}
            playsInline
          />
        ) : null}
        {props.projectAudio ? (
          <audio ref={props.projectAudioRef} src={props.projectAudio.url} />
        ) : null}
        <SubtitleOverlay subtitle={props.activeSubtitle} onClick={props.onSubtitleClick} />
      </>
    );
  }

  return (
    <>
      <video
        ref={props.importedVideoRef}
        className="studio-screen-video"
        style={props.screenStyle}
        src={props.item.url}
        playsInline
        onLoadedMetadata={(event) => props.onDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => props.onTimeUpdate(event.currentTarget.currentTime)}
        onEnded={props.onEnded}
      />
      <SubtitleOverlay subtitle={props.activeSubtitle} onClick={props.onSubtitleClick} />
    </>
  );
}

function SubtitleOverlay(props: {
  subtitle: SubtitleSegment | null;
  onClick: (subtitleId: string) => void;
}) {
  if (!props.subtitle) {
    return null;
  }

  const words = props.subtitle.text.trim().split(/\s+/);
  const highlightedWord = words.length > 1 ? words.pop() : null;
  const leadingText = highlightedWord ? words.join(" ") : props.subtitle.text;

  return (
    <button
      className="subtitle-overlay"
      type="button"
      onClick={() => props.onClick(props.subtitle?.id ?? "")}
    >
      {leadingText}
      {highlightedWord ? <span>{highlightedWord}</span> : null}
    </button>
  );
}

function AssetCard(props: {
  item: EditorMediaItem;
  selected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      className={`asset-card ${props.selected ? "asset-card-selected" : ""}`}
    >
      <button className="asset-card-main" type="button" onClick={props.onSelect}>
        <div className="asset-preview">
          {props.item.kind === "video" ? (
            <video src={props.item.url} muted playsInline />
          ) : props.item.kind === "image" ? (
            <img src={props.item.url} alt="" />
          ) : (
            <AudioLines size={18} />
          )}
        </div>
        <strong>{props.item.name}</strong>
        <span>{props.item.origin === "project" ? "Recording" : props.item.kind}</span>
      </button>
      {props.onRemove ? (
        <button
          className="asset-remove-button"
          type="button"
          onClick={props.onRemove}
          title="Remove imported media"
        >
          <Trash2 size={13} />
        </button>
      ) : null}
    </div>
  );
}

function TimelineEditStrip(props: {
  activeTool: EditorTool;
  activeDuration: number;
  trimRange: { start: number; end: number };
  selectedZoomEffect: ZoomEffect | null;
  onAddMergeClip: () => void;
  onRemoveZoom: (id: string) => void;
  onTrimEndChange: (value: number) => void;
  onTrimStartChange: (value: number) => void;
  onZoomChange: (id: string, updates: Partial<ZoomEffect>) => void;
}) {
  if (props.activeTool === "zoom" && props.selectedZoomEffect) {
    const effect = props.selectedZoomEffect;

    return (
      <div className="timeline-edit-strip">
        <div className="timeline-edit-title">
          <WandSparkles size={15} />
          <strong>{effect.direction === "in" ? "Zoom in" : "Zoom out"}</strong>
        </div>
        <label>
          <span>Start</span>
          <input
            type="number"
            min={0}
            max={props.activeDuration}
            step={0.1}
            value={Number(effect.start.toFixed(1))}
            onChange={(event) =>
              props.onZoomChange(effect.id, {
                start: Math.min(Number(event.target.value), effect.end - 0.1)
              })
            }
          />
        </label>
        <label>
          <span>End</span>
          <input
            type="number"
            min={effect.start + 0.1}
            max={props.activeDuration}
            step={0.1}
            value={Number(effect.end.toFixed(1))}
            onChange={(event) =>
              props.onZoomChange(effect.id, {
                end: Math.max(Number(event.target.value), effect.start + 0.1)
              })
            }
          />
        </label>
        <label className="timeline-edit-range">
          <span>Strength</span>
          <input
            type="range"
            min={10}
            max={60}
            value={Math.round(effect.intensity * 100)}
            onChange={(event) =>
              props.onZoomChange(effect.id, { intensity: Number(event.target.value) / 100 })
            }
          />
        </label>
        <button
          className="timeline-delete-button"
          type="button"
          onClick={() => props.onRemoveZoom(effect.id)}
        >
          <Trash2 size={14} />
        </button>
      </div>
    );
  }

  if (props.activeTool === "cut") {
    return (
      <div className="timeline-edit-strip">
        <div className="timeline-edit-title">
          <Scissors size={15} />
          <strong>Cut</strong>
        </div>
        <label>
          <span>Start</span>
          <input
            type="number"
            min={0}
            max={props.activeDuration}
            step={0.1}
            value={Number(props.trimRange.start.toFixed(1))}
            onChange={(event) => props.onTrimStartChange(Number(event.target.value))}
          />
        </label>
        <label>
          <span>End</span>
          <input
            type="number"
            min={props.trimRange.start}
            max={props.activeDuration}
            step={0.1}
            value={Number(props.trimRange.end.toFixed(1))}
            onChange={(event) => props.onTrimEndChange(Number(event.target.value))}
          />
        </label>
        <label className="timeline-edit-range">
          <span>Range</span>
          <input
            type="range"
            min={0}
            max={Math.max(props.activeDuration, 1)}
            step={0.1}
            value={props.trimRange.start}
            onChange={(event) => props.onTrimStartChange(Number(event.target.value))}
          />
        </label>
        <button className="timeline-merge-button" type="button" onClick={props.onAddMergeClip}>
          <Combine size={14} />
          Merge
        </button>
      </div>
    );
  }

  return null;
}

function TimelineTrack(props: {
  label: string;
  accent: "purple" | "cyan" | "green" | "amber" | "rose";
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="timeline-track">
      <div className={`track-label track-${props.accent}`}>
        {props.icon}
        <span>{props.label}</span>
      </div>
      <div className="track-lane">{props.children}</div>
    </div>
  );
}

function TimelineClip(props: {
  item: EditorMediaItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const width = props.item.kind === "image" ? "22%" : props.item.kind === "audio" ? "58%" : "64%";
  const left = props.item.origin === "project" ? "2%" : props.item.kind === "audio" ? "25%" : "34%";
  const className =
    props.item.kind === "audio"
      ? "clip clip-audio"
      : props.item.kind === "image"
        ? "clip clip-image"
        : "clip clip-main";

  return (
    <button
      className={`${className} ${props.selected ? "clip-selected" : ""}`}
      type="button"
      style={{ left, width }}
      onClick={props.onSelect}
    >
      {props.item.kind === "audio" ? (
        <span className="waveform" />
      ) : (
        <>
          <span className="clip-thumb" />
          <Film size={13} />
        </>
      )}
      <strong>{props.item.name}</strong>
    </button>
  );
}

function TimelineZoomClip(props: {
  effect: ZoomEffect;
  duration: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const safeDuration = Math.max(props.duration, props.effect.end, 1);
  const left = `${Math.max(0, (props.effect.start / safeDuration) * 100)}%`;
  const width = `${Math.max(
    6,
    ((props.effect.end - props.effect.start) / safeDuration) * 100
  )}%`;

  return (
    <button
      className={`clip clip-zoom ${props.selected ? "clip-selected" : ""}`}
      type="button"
      style={{ left, width }}
      onClick={props.onSelect}
    >
      {props.effect.direction === "in" ? <ZoomIn size={13} /> : <ZoomOut size={13} />}
      <strong>{props.effect.direction === "in" ? "Zoom in" : "Zoom out"}</strong>
    </button>
  );
}

function TimelineTrimClip(props: {
  duration: number;
  range: { start: number; end: number };
  selected: boolean;
  onSelect: () => void;
}) {
  const safeDuration = Math.max(props.duration, props.range.end, 1);
  const left = `${Math.max(0, (props.range.start / safeDuration) * 100)}%`;
  const width = `${Math.max(
    6,
    ((props.range.end - props.range.start) / safeDuration) * 100
  )}%`;

  return (
    <button
      className={`clip clip-trim ${props.selected ? "clip-selected" : ""}`}
      type="button"
      style={{ left, width }}
      onClick={props.onSelect}
    >
      <Scissors size={13} />
      <strong>
        {formatSeconds(props.range.start)} - {formatSeconds(props.range.end)}
      </strong>
    </button>
  );
}

function TimelineSubtitleClip(props: {
  subtitle: SubtitleSegment;
  duration: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const safeDuration = Math.max(props.duration, props.subtitle.end, 1);
  const left = `${Math.max(0, (props.subtitle.start / safeDuration) * 100)}%`;
  const width = `${Math.max(
    6,
    ((props.subtitle.end - props.subtitle.start) / safeDuration) * 100
  )}%`;

  return (
    <button
      className={`clip clip-text ${props.selected ? "clip-selected" : ""}`}
      type="button"
      style={{ left, width }}
      onClick={props.onSelect}
    >
      <Captions size={13} />
      <strong>{props.subtitle.text}</strong>
    </button>
  );
}

function createProjectMedia(project: ProjectView | null): EditorMediaItem[] {
  if (!project) {
    return [];
  }

  const items: EditorMediaItem[] = [];
  const duration = (project.durationMs ?? 0) / 1000 || null;

  if (project.mediaUrls.screen) {
    items.push({
      id: `${project.id}:screen`,
      name: "screen.webm",
      url: project.mediaUrls.screen,
      kind: "video",
      origin: "project",
      track: "screen",
      duration
    });
  }

  if (project.mediaUrls.camera) {
    items.push({
      id: `${project.id}:camera`,
      name: "camera.webm",
      url: project.mediaUrls.camera,
      kind: "video",
      origin: "project",
      track: "camera",
      duration
    });
  }

  const audioUrl = project.mediaUrls.micWav ?? project.mediaUrls.micWebm;
  if (audioUrl) {
    items.push({
      id: `${project.id}:audio`,
      name: project.mediaUrls.micWav ? "mic.wav" : "mic.webm",
      url: audioUrl,
      kind: "audio",
      origin: "project",
      track: "audio",
      duration
    });
  }

  return items;
}

function toEditorMediaItem(file: ImportedMediaFile): EditorMediaItem {
  return {
    id: file.id,
    name: file.name,
    url: file.url,
    kind: file.kind,
    origin: "imported",
    track: "imported",
    duration: null,
    importId: file.id
  };
}

function compactMediaElements(
  elements: Array<HTMLMediaElement | null>
): HTMLMediaElement[] {
  return elements.filter((element): element is HTMLMediaElement => Boolean(element));
}

function getActiveZoom(effects: ZoomEffect[], time: number): { scale: number } {
  const effect = effects.find((item) => time >= item.start && time <= item.end);

  if (!effect) {
    return { scale: 1 };
  }

  const duration = Math.max(0.1, effect.end - effect.start);
  const rawProgress = Math.min(1, Math.max(0, (time - effect.start) / duration));
  const progress = rawProgress * rawProgress * (3 - 2 * rawProgress);
  const zoomProgress = effect.direction === "in" ? progress : 1 - progress;

  return {
    scale: 1 + effect.intensity * zoomProgress
  };
}

function createTimelineTicks(duration: number): string[] {
  const safeDuration = Math.max(duration, 10);
  const tickCount = 6;

  return Array.from({ length: tickCount }, (_value, index) =>
    formatSeconds((safeDuration / (tickCount - 1)) * index)
  );
}

function formatTimecode(seconds: number, frame: number): string {
  if (!Number.isFinite(seconds)) {
    return "00:00:00:00";
  }

  const rounded = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;
  const remainingFrames = Math.max(0, frame % frameRate);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
    remainingSeconds
  ).padStart(2, "0")}:${String(remainingFrames).padStart(2, "0")}`;
}

function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return "00:00";
  }

  const rounded = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
