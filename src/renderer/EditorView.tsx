import {
  AudioLines,
  Captions,
  ChevronDown,
  CircleStop,
  Download,
  Eye,
  Film,
  FolderOpen,
  Image,
  Lock,
  MoreHorizontal,
  MousePointer2,
  Play,
  Plus,
  Scissors,
  Settings2,
  Sparkles,
  Type,
  Upload,
  Volume2
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ProjectView } from "../shared/types";

const timeTicks = ["00:00", "00:05", "00:10", "00:15", "00:20", "00:25", "00:30"];

export function EditorView() {
  const projectId = useMemo(
    () => new URLSearchParams(window.location.search).get("projectId"),
    []
  );
  const [project, setProject] = useState<ProjectView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const screenRef = useRef<HTMLVideoElement | null>(null);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!projectId) {
      setError("No project was provided to the editor.");
      return;
    }

    void window.openVideoCraft.projects
      .get(projectId)
      .then(setProject)
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      });
  }, [projectId]);

  function mediaElements(): HTMLMediaElement[] {
    return [screenRef.current, cameraRef.current, audioRef.current].filter(
      (element): element is HTMLMediaElement => Boolean(element)
    );
  }

  async function togglePlayback() {
    const elements = mediaElements();

    if (playing) {
      elements.forEach((element) => element.pause());
      setPlaying(false);
      return;
    }

    elements.forEach((element) => {
      element.currentTime = currentTime;
    });
    await Promise.all(elements.map((element) => element.play()));
    setPlaying(true);
  }

  function seek(value: number) {
    setCurrentTime(value);
    mediaElements().forEach((element) => {
      element.currentTime = value;
    });
  }

  const screenUrl = project?.mediaUrls.screen;
  const cameraUrl = project?.mediaUrls.camera;
  const audioUrl = project?.mediaUrls.micWav ?? project?.mediaUrls.micWebm;
  const projectName = project?.name ?? "Untitled Recording";
  const clipDuration = duration > 0 ? formatSeconds(duration) : "00:30";
  const playheadPercent =
    duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 42;

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
            <button className="studio-export-button" type="button">
              <Download size={16} />
              Export
            </button>
          </div>
        </header>

        {error ? <div className="studio-error">{error}</div> : null}

        <div className="studio-workspace">
          <aside className="studio-rail">
            <button className="studio-rail-active" type="button" title="Media">
              <FolderOpen size={18} />
            </button>
            <button type="button" title="Text">
              <Type size={18} />
            </button>
            <button type="button" title="Audio">
              <AudioLines size={18} />
            </button>
            <button type="button" title="Captions">
              <Captions size={18} />
            </button>
            <button type="button" title="Effects">
              <Sparkles size={18} />
            </button>
          </aside>

          <aside className="media-panel">
            <button className="import-button" type="button">
              <Upload size={15} />
              Import media
            </button>
            <div className="media-tabs">
              <button className="media-tab-active" type="button">All Media</button>
              <button type="button">Video</button>
              <button type="button">Image</button>
              <button type="button">Sound</button>
            </div>

            <div className="asset-grid">
              <AssetCard
                title="Screen.webm"
                type="Recording"
                icon={<Film size={15} />}
                mediaUrl={screenUrl}
              />
              <AssetCard
                title="Camera.webm"
                type={cameraUrl ? "Camera" : "Optional"}
                icon={<Image size={15} />}
                mediaUrl={cameraUrl}
              />
              <AssetCard title="Voice.wav" type="Audio" icon={<AudioLines size={15} />} />
              <AssetCard title="Captions" type="Text layer" icon={<Captions size={15} />} />
            </div>
          </aside>

          <section className="preview-panel">
            <div className="preview-canvas">
              <div className="preview-composition-frame">
                {screenUrl ? (
                  <video
                    ref={screenRef}
                    className="studio-screen-video"
                    src={screenUrl}
                    playsInline
                    onLoadedMetadata={(event) => {
                      const nextDuration = event.currentTarget.duration;
                      if (Number.isFinite(nextDuration)) {
                        setDuration(nextDuration);
                      }
                    }}
                    onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                    onEnded={() => setPlaying(false)}
                  />
                ) : (
                  <div className="studio-video-empty">Waiting for recorded media.</div>
                )}

                <div className="title-overlay-box">
                  <span>Open Video Craft</span>
                  <strong>Screen Recording</strong>
                </div>

                {cameraUrl ? (
                  <video
                    ref={cameraRef}
                    className="studio-camera-bubble"
                    src={cameraUrl}
                    playsInline
                  />
                ) : null}

                {audioUrl ? <audio ref={audioRef} src={audioUrl} /> : null}
              </div>

              <div className="preview-tools">
                <button type="button">16:9</button>
                <button type="button" onClick={() => void togglePlayback()}>
                  {playing ? <CircleStop size={16} /> : <Play size={16} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={Math.max(duration, 0)}
                  step={0.05}
                  value={Math.min(currentTime, duration || 0)}
                  onChange={(event) => seek(Number(event.target.value))}
                />
                <span>{formatSeconds(currentTime)}</span>
              </div>
            </div>
          </section>

          <aside className="inspector-panel">
            <div className="inspector-header">
              <strong>Text Setting</strong>
              <MoreHorizontal size={18} />
            </div>

            <label>
              <span>Font</span>
              <select defaultValue="Inter">
                <option>Inter</option>
                <option>Montserrat</option>
                <option>Manrope</option>
              </select>
            </label>

            <div className="setting-grid">
              <button type="button">20</button>
              <button type="button">Bold</button>
              <button type="button">Auto</button>
              <button type="button">1.2%</button>
            </div>

            <div className="align-grid">
              <button type="button">L</button>
              <button type="button">C</button>
              <button type="button">R</button>
              <button type="button">U</button>
            </div>

            <label>
              <span>Color</span>
              <div className="color-setting">
                <i />
                <code>#22E68B</code>
                <span>100%</span>
              </div>
            </label>

            <label>
              <span>Border</span>
              <div className="color-setting border-setting">
                <i />
                <code>#000000</code>
                <span>0%</span>
              </div>
            </label>
          </aside>
        </div>

        <section className="timeline-panel">
          <div className="timeline-toolbar">
            <div className="timeline-toolset">
              <span>Speed</span>
              <button type="button">1.0X</button>
              <button type="button"><Scissors size={14} /></button>
              <button type="button"><MousePointer2 size={14} /></button>
            </div>

            <div className="timeline-ruler">
              {timeTicks.map((tick) => (
                <span key={tick}>{tick}</span>
              ))}
            </div>
          </div>

          <div className="timeline-body">
            <div className="playhead" style={{ left: `${playheadPercent}%` }}>
              <span />
            </div>
            <TimelineTrack label="Media 1" accent="purple" locked>
              <div className="clip clip-video clip-main">
                <span className="clip-thumb" />
                <strong>{project?.tracks.screen ? "Screen.webm" : "Screen clip"}</strong>
                <Lock size={13} />
              </div>
            </TimelineTrack>

            <TimelineTrack label="Audio 1" accent="cyan">
              <div className="clip clip-audio">
                <span className="waveform" />
                <strong>{audioUrl ? "Voice.wav" : "Recorded audio"}</strong>
                <Volume2 size={13} />
              </div>
              <div className="clip clip-audio clip-audio-short">
                <span className="waveform" />
                <strong>Intro.mp3</strong>
              </div>
            </TimelineTrack>

            <TimelineTrack label="Text 1" accent="blue">
              <div className="clip clip-text">
                <strong>Open Video Craft Recording</strong>
                <Type size={13} />
              </div>
              <div className="clip clip-text clip-text-end">
                <strong>Ready to Edit</strong>
                <Type size={13} />
              </div>
            </TimelineTrack>
          </div>
        </section>
      </section>
    </main>
  );
}

function AssetCard(props: {
  title: string;
  type: string;
  icon: ReactNode;
  mediaUrl?: string;
}) {
  return (
    <button className="asset-card" type="button">
      <div className="asset-preview">
        {props.mediaUrl ? <video src={props.mediaUrl} muted playsInline /> : props.icon}
      </div>
      <strong>{props.title}</strong>
      <span>{props.type}</span>
    </button>
  );
}

function TimelineTrack(props: {
  label: string;
  accent: "purple" | "cyan" | "blue";
  locked?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="timeline-track">
      <div className={`track-label track-${props.accent}`}>
        <span>{props.label}</span>
        <button type="button"><Eye size={13} /></button>
        {props.locked ? <Lock size={13} /> : null}
      </div>
      <div className="track-lane">{props.children}</div>
    </div>
  );
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
