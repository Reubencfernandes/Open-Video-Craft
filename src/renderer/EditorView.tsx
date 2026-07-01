import {
  AudioLines,
  ChevronDown,
  CircleStop,
  Download,
  Film,
  FolderOpen,
  Image,
  Play,
  Plus,
  Scissors,
  Settings2,
  SkipBack,
  SkipForward,
  Upload,
  Video
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ImportedMediaFile, ImportedMediaKind, ProjectView } from "../shared/types";

type MediaPanel = "all" | "video" | "audio" | "image";

type EditorMediaItem = {
  id: string;
  name: string;
  url: string;
  kind: ImportedMediaKind;
  origin: "project" | "imported";
  track: "screen" | "camera" | "audio" | "imported";
  duration: number | null;
};

const frameRate = 30;

export function EditorView() {
  const projectId = useMemo(
    () => new URLSearchParams(window.location.search).get("projectId"),
    []
  );
  const [project, setProject] = useState<ProjectView | null>(null);
  const [importedMedia, setImportedMedia] = useState<EditorMediaItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<MediaPanel>("all");
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
  const isProjectScreenSelected = selectedItem?.id === projectScreen?.id;
  const activeDuration =
    duration > 0 ? duration : selectedItem?.duration ?? (project?.durationMs ?? 0) / 1000;
  const totalFrames = Math.max(1, Math.floor(activeDuration * frameRate));
  const currentFrame = Math.min(totalFrames, Math.max(0, Math.round(currentTime * frameRate)));
  const playheadPercent =
    activeDuration > 0 ? Math.min(100, Math.max(0, (currentTime / activeDuration) * 100)) : 0;

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

  async function importMedia() {
    const files = await window.openVideoCraft.editor.importMedia();
    if (files.length === 0) {
      return;
    }

    const nextItems = files.map(toEditorMediaItem);
    setImportedMedia((current) => [...current, ...nextItems]);
    setSelectedItemId(nextItems[0].id);
    setActivePanel("all");
  }

  function mediaElements(): HTMLMediaElement[] {
    if (!selectedItem) {
      return [];
    }

    if (selectedItem.kind === "audio") {
      return compactMediaElements([importedAudioRef.current]);
    }

    if (isProjectScreenSelected) {
      return compactMediaElements([
        screenRef.current,
        cameraRef.current,
        projectAudioRef.current
      ]);
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
            <span>Project: {projectName}</span>
            <ChevronDown size={15} />
          </button>

          <div className="studio-top-actions">
            <button className="studio-icon-button" type="button" title="Settings">
              <Settings2 size={17} />
            </button>
            <button className="studio-export-button" type="button" disabled>
              <Download size={16} />
              Export
            </button>
          </div>
        </header>

        {error ? <div className="studio-error">{error}</div> : null}

        <div className="studio-workspace">
          <aside className="studio-rail">
            <button
              className={activePanel === "all" ? "studio-rail-active" : ""}
              type="button"
              title="Media"
              onClick={() => setActivePanel("all")}
            >
              <FolderOpen size={18} />
            </button>
            <button
              className={activePanel === "video" ? "studio-rail-active" : ""}
              type="button"
              title="Video"
              onClick={() => setActivePanel("video")}
            >
              <Video size={18} />
            </button>
            <button
              className={activePanel === "audio" ? "studio-rail-active" : ""}
              type="button"
              title="Audio"
              onClick={() => setActivePanel("audio")}
            >
              <AudioLines size={18} />
            </button>
            <button
              className={activePanel === "image" ? "studio-rail-active" : ""}
              type="button"
              title="Images"
              onClick={() => setActivePanel("image")}
            >
              <Image size={18} />
            </button>
          </aside>

          <aside className="media-panel">
            <button className="import-button" type="button" onClick={() => void importMedia()}>
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
                  {panel === "all" ? "All Media" : panel}
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
                />
              ))}
            </div>

            {visibleMedia.length === 0 ? (
              <div className="media-empty">
                <Plus size={18} />
                <span>Import media or finish a recording to begin editing.</span>
              </div>
            ) : null}
          </aside>

          <section className="preview-panel">
            <div className="preview-canvas">
              <div className="preview-composition-frame">
                {selectedItem ? (
                  <PreviewContent
                    item={selectedItem}
                    isProjectScreenSelected={isProjectScreenSelected}
                    projectCamera={projectCamera}
                    projectAudio={projectAudio}
                    screenRef={screenRef}
                    cameraRef={cameraRef}
                    projectAudioRef={projectAudioRef}
                    importedVideoRef={importedVideoRef}
                    importedAudioRef={importedAudioRef}
                    onDuration={updateDuration}
                    onTimeUpdate={setCurrentTime}
                    onEnded={() => setPlaying(false)}
                  />
                ) : (
                  <div className="studio-video-empty">Import media or record a screen.</div>
                )}
              </div>

              <div className="preview-tools">
                <button type="button">16:9</button>
                <button type="button" onClick={() => void togglePlayback()}>
                  {playing ? <CircleStop size={16} /> : <Play size={16} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={Math.max(activeDuration, 0)}
                  step={1 / frameRate}
                  value={Math.min(currentTime, activeDuration || 0)}
                  onChange={(event) => seek(Number(event.target.value))}
                />
                <span>{formatSeconds(currentTime)}</span>
              </div>
            </div>
          </section>

          <aside className="inspector-panel">
            <div className="inspector-header">
              <strong>Clip</strong>
              <Scissors size={18} />
            </div>

            <div className="clip-inspector">
              <label>
                <span>Name</span>
                <output>{selectedItem?.name ?? "No media selected"}</output>
              </label>
              <label>
                <span>Type</span>
                <output>{selectedItem?.kind ?? "-"}</output>
              </label>
              <label>
                <span>Duration</span>
                <output>{formatSeconds(activeDuration)}</output>
              </label>
              <label>
                <span>Frame</span>
                <output>
                  {currentFrame} / {totalFrames}
                </output>
              </label>
            </div>
          </aside>
        </div>

        <section className="timeline-panel">
          <div className="timeline-toolbar">
            <div className="timeline-toolset">
              <button type="button" onClick={() => seekFrame(currentFrame - 1)}>
                <SkipBack size={14} />
              </button>
              <span>{formatSeconds(currentTime)}</span>
              <button type="button" onClick={() => seekFrame(currentFrame + 1)}>
                <SkipForward size={14} />
              </button>
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
          </div>

          <div className="timeline-body">
            <div className="playhead" style={{ left: `${playheadPercent}%` }}>
              <span />
            </div>
            <TimelineTrack label="Media" accent="purple">
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

            <TimelineTrack label="Audio" accent="cyan">
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
          </div>
        </section>
      </section>
    </main>
  );
}

function PreviewContent(props: {
  item: EditorMediaItem;
  isProjectScreenSelected: boolean;
  projectCamera: EditorMediaItem | null;
  projectAudio: EditorMediaItem | null;
  screenRef: React.RefObject<HTMLVideoElement | null>;
  cameraRef: React.RefObject<HTMLVideoElement | null>;
  projectAudioRef: React.RefObject<HTMLAudioElement | null>;
  importedVideoRef: React.RefObject<HTMLVideoElement | null>;
  importedAudioRef: React.RefObject<HTMLAudioElement | null>;
  onDuration: (duration: number | null) => void;
  onTimeUpdate: (time: number) => void;
  onEnded: () => void;
}) {
  if (props.item.kind === "image") {
    return <img className="studio-screen-video" src={props.item.url} alt="" />;
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

  if (props.isProjectScreenSelected) {
    return (
      <>
        <video
          ref={props.screenRef}
          className="studio-screen-video"
          src={props.item.url}
          playsInline
          onLoadedMetadata={(event) => props.onDuration(event.currentTarget.duration)}
          onTimeUpdate={(event) => props.onTimeUpdate(event.currentTarget.currentTime)}
          onEnded={props.onEnded}
        />
        {props.projectCamera ? (
          <video
            ref={props.cameraRef}
            className="studio-camera-bubble"
            src={props.projectCamera.url}
            playsInline
          />
        ) : null}
        {props.projectAudio ? (
          <audio ref={props.projectAudioRef} src={props.projectAudio.url} />
        ) : null}
      </>
    );
  }

  return (
    <video
      ref={props.importedVideoRef}
      className="studio-screen-video"
      src={props.item.url}
      playsInline
      onLoadedMetadata={(event) => props.onDuration(event.currentTarget.duration)}
      onTimeUpdate={(event) => props.onTimeUpdate(event.currentTarget.currentTime)}
      onEnded={props.onEnded}
    />
  );
}

function AssetCard(props: {
  item: EditorMediaItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`asset-card ${props.selected ? "asset-card-selected" : ""}`}
      type="button"
      onClick={props.onSelect}
    >
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
  );
}

function TimelineTrack(props: {
  label: string;
  accent: "purple" | "cyan";
  children: React.ReactNode;
}) {
  return (
    <div className="timeline-track">
      <div className={`track-label track-${props.accent}`}>
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
  const width = props.item.kind === "image" ? "24%" : "62%";
  const left = props.item.origin === "project" ? "1%" : "34%";
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
      {props.item.kind === "audio" ? <span className="waveform" /> : <Film size={13} />}
      <strong>{props.item.name}</strong>
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
    duration: null
  };
}

function compactMediaElements(
  elements: Array<HTMLMediaElement | null>
): HTMLMediaElement[] {
  return elements.filter((element): element is HTMLMediaElement => Boolean(element));
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
