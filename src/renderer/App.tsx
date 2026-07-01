import {
  Camera,
  CheckCircle2,
  CircleStop,
  FolderOpen,
  Mic,
  Monitor,
  Play,
  RefreshCcw,
  ScreenShare,
  Settings2,
  Video,
  Wand2
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DeviceSelection,
  ProjectDevices,
  ProjectSource,
  ProjectView,
  RecordingTrack,
  SourceSummary
} from "../shared/types";

type RecorderState =
  | "ready"
  | "selecting"
  | "recording"
  | "stopping"
  | "processing"
  | "complete"
  | "failed";

type DeviceOption = {
  deviceId: string;
  label: string;
};

type RecorderMap = Partial<Record<RecordingTrack, MediaRecorder>>;
type WriteQueues = Partial<Record<RecordingTrack, Promise<unknown>>>;

const videoMimeCandidates = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm"
];

const audioMimeCandidates = ["audio/webm;codecs=opus", "audio/webm"];

export function App() {
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Untitled Recording");
  const [baseDirectory, setBaseDirectory] = useState<string | null>(null);
  const [microphones, setMicrophones] = useState<DeviceOption[]>([]);
  const [cameras, setCameras] = useState<DeviceOption[]>([]);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [selectedMicId, setSelectedMicId] = useState<string | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [state, setState] = useState<RecorderState>("ready");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectView | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const screenPreviewRef = useRef<HTMLVideoElement | null>(null);
  const cameraPreviewRef = useRef<HTMLVideoElement | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recordersRef = useRef<RecorderMap>({});
  const writeQueuesRef = useRef<WriteQueues>({});
  const projectRef = useRef<ProjectView | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const stoppingRef = useRef(false);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId, sources]
  );

  const canStart =
    state === "ready" || state === "complete" || state === "failed";

  const refreshSources = useCallback(async () => {
    const nextSources = await window.openVideoCraft.sources.list();
    setSources(nextSources);
    setSelectedSourceId((current) => {
      if (current && nextSources.some((source) => source.id === current)) {
        return current;
      }

      return nextSources[0]?.id ?? null;
    });
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const nextMicrophones = devices
      .filter((device) => device.kind === "audioinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Microphone ${index + 1}`
      }));
    const nextCameras = devices
      .filter((device) => device.kind === "videoinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${index + 1}`
      }));

    setMicrophones(nextMicrophones);
    setCameras(nextCameras);
    setSelectedMicId((current) => current ?? nextMicrophones[0]?.deviceId ?? null);
    setSelectedCameraId((current) => current ?? nextCameras[0]?.deviceId ?? null);
  }, []);

  useEffect(() => {
    void refreshSources().catch((error) => setErrorMessage(toErrorMessage(error)));
    void refreshDevices().catch(() => undefined);
  }, [refreshDevices, refreshSources]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    if (state !== "recording") {
      return;
    }

    const timer = window.setInterval(() => {
      const startedAt = recordingStartedAtRef.current;
      setElapsedMs(startedAt ? Date.now() - startedAt : 0);
    }, 250);

    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (screenPreviewRef.current) {
      screenPreviewRef.current.srcObject = screenStreamRef.current;
    }

    if (cameraPreviewRef.current) {
      cameraPreviewRef.current.srcObject = cameraStreamRef.current;
    }
  }, [state]);

  async function chooseFolder() {
    const folder = await window.openVideoCraft.projects.chooseBaseDirectory();

    if (folder) {
      setBaseDirectory(folder);
    }
  }

  async function startRecording() {
    if (!selectedSource) {
      setErrorMessage("Choose a display or window before recording.");
      return;
    }

    if (!baseDirectory) {
      setErrorMessage("Choose a project folder before recording.");
      return;
    }

    setState("selecting");
    setErrorMessage(null);
    stoppingRef.current = false;
    writeQueuesRef.current = {};

    try {
      await window.openVideoCraft.capture.selectDisplaySource(selectedSource.id);

      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 30
        },
        audio: false
      });

      const cameraStream =
        cameraEnabled && selectedCameraId
          ? await navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: {
                  exact: selectedCameraId
                }
              },
              audio: false
            })
          : null;

      const micStream =
        micEnabled && selectedMicId
          ? await navigator.mediaDevices.getUserMedia({
              video: false,
              audio: {
                deviceId: {
                  exact: selectedMicId
                }
              }
            })
          : null;

      const screenMimeType = getSupportedMimeType(videoMimeCandidates);
      const cameraMimeType = cameraStream ? getSupportedMimeType(videoMimeCandidates) : null;
      const micMimeType = micStream ? getSupportedMimeType(audioMimeCandidates) : null;

      const createdProject = await window.openVideoCraft.projects.create({
        name: projectName,
        baseDirectory
      });

      const devices = createProjectDevices({
        microphones,
        cameras,
        micEnabled: Boolean(micStream),
        cameraEnabled: Boolean(cameraStream),
        selectedMicId,
        selectedCameraId
      });

      const source: ProjectSource = {
        id: selectedSource.id,
        name: selectedSource.name,
        kind: selectedSource.kind,
        displayId: selectedSource.displayId
      };

      const startedProject = await window.openVideoCraft.recording.start({
        projectId: createdProject.id,
        source,
        devices,
        tracks: {
          screen: {
            enabled: true,
            mimeType: screenMimeType
          },
          camera: {
            enabled: Boolean(cameraStream),
            mimeType: cameraMimeType
          },
          mic: {
            enabled: Boolean(micStream),
            mimeType: micMimeType
          }
        }
      });

      setProject(startedProject);
      projectRef.current = startedProject;
      screenStreamRef.current = screenStream;
      cameraStreamRef.current = cameraStream;
      micStreamRef.current = micStream;
      assignPreviewStreams();

      recordersRef.current = createRecorders({
        screenStream,
        cameraStream,
        micStream,
        screenMimeType,
        cameraMimeType,
        micMimeType,
        onChunk: (track, blob) => queueChunkWrite(startedProject.id, track, blob),
        onError: (error) => void failRecording(toErrorMessage(error))
      });

      screenStream.getVideoTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          void stopRecording();
        });
      });

      recordingStartedAtRef.current = Date.now();
      setElapsedMs(0);
      setState("recording");

      Object.values(recordersRef.current).forEach((recorder) => recorder?.start(1000));
      await refreshDevices();
    } catch (error) {
      stopAllStreams();
      setState("failed");
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function stopRecording() {
    if (stoppingRef.current || state !== "recording") {
      return;
    }

    stoppingRef.current = true;
    setState("stopping");

    const currentProject = projectRef.current;
    const startedAt = recordingStartedAtRef.current;
    const durationMs = startedAt ? Date.now() - startedAt : elapsedMs;

    try {
      await Promise.all(
        Object.values(recordersRef.current).map((recorder) =>
          recorder ? stopRecorder(recorder) : Promise.resolve()
        )
      );
      await Promise.all(Object.values(writeQueuesRef.current));
      stopAllStreams();

      if (!currentProject) {
        throw new Error("Recording stopped before a project was created.");
      }

      const stoppedProject = await window.openVideoCraft.recording.stop({
        projectId: currentProject.id,
        durationMs
      });
      setProject(stoppedProject);
      setState("processing");

      const preparedProject = await window.openVideoCraft.ffmpeg.prepareAudio(
        stoppedProject.id
      );
      setProject(preparedProject);
      projectRef.current = preparedProject;
      setElapsedMs(durationMs);
      setState("complete");
      await refreshSources();
    } catch (error) {
      await failRecording(toErrorMessage(error));
    }
  }

  async function failRecording(message: string) {
    stopAllStreams();
    setErrorMessage(message);
    setState("failed");

    const currentProject = projectRef.current;
    if (currentProject) {
      try {
        const failedProject = await window.openVideoCraft.recording.fail({
          projectId: currentProject.id,
          error: message
        });
        setProject(failedProject);
        projectRef.current = failedProject;
      } catch {
        // The original error is more useful to keep in the UI.
      }
    }
  }

  function queueChunkWrite(projectId: string, track: RecordingTrack, blob: Blob) {
    if (blob.size === 0) {
      return;
    }

    const previous = writeQueuesRef.current[track] ?? Promise.resolve();
    writeQueuesRef.current[track] = previous.then(async () => {
      const chunk = await blob.arrayBuffer();
      const updatedProject = await window.openVideoCraft.recording.writeChunk({
        projectId,
        track,
        chunk
      });
      setProject(updatedProject);
      projectRef.current = updatedProject;
    });
  }

  function assignPreviewStreams() {
    if (screenPreviewRef.current) {
      screenPreviewRef.current.srcObject = screenStreamRef.current;
      void screenPreviewRef.current.play().catch(() => undefined);
    }

    if (cameraPreviewRef.current) {
      cameraPreviewRef.current.srcObject = cameraStreamRef.current;
      void cameraPreviewRef.current.play().catch(() => undefined);
    }
  }

  function stopAllStreams() {
    Object.values(recordersRef.current).forEach((recorder) => {
      if (recorder?.state === "recording" || recorder?.state === "paused") {
        recorder.stop();
      }
    });
    recordersRef.current = {};

    for (const stream of [
      screenStreamRef.current,
      cameraStreamRef.current,
      micStreamRef.current
    ]) {
      stream?.getTracks().forEach((track) => track.stop());
    }

    screenStreamRef.current = null;
    cameraStreamRef.current = null;
    micStreamRef.current = null;
    assignPreviewStreams();
  }

  return (
    <main className="min-h-screen bg-[#101114] text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col gap-5 px-5 py-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.26em] text-cyan-300">
              Open Video Craft
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal text-white">
              Recorder MVP
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              className="secondary-button px-3"
              type="button"
              onClick={() => void window.openVideoCraft.windows.openRecorderController()}
            >
              <ScreenShare size={18} />
              <span>Floating controller</span>
            </button>
            <StatusBadge state={state} />
            <button
              className="icon-button"
              type="button"
              onClick={() => void refreshSources()}
              title="Refresh capture sources"
            >
              <RefreshCcw size={18} />
            </button>
          </div>
        </header>

        {errorMessage ? (
          <div className="rounded-md border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {errorMessage}
          </div>
        ) : null}

        <section className="grid flex-1 grid-cols-[minmax(320px,390px)_1fr] gap-5 max-[1050px]:grid-cols-1">
          <aside className="control-panel">
            <section className="space-y-3">
              <PanelTitle icon={<FolderOpen size={17} />} title="Project" />
              <label className="field-label" htmlFor="projectName">
                Name
              </label>
              <input
                id="projectName"
                className="text-input"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                disabled={!canStart}
              />
              <button
                className="secondary-button w-full"
                type="button"
                onClick={() => void chooseFolder()}
                disabled={!canStart}
              >
                <FolderOpen size={17} />
                <span>{baseDirectory ? shortPath(baseDirectory) : "Choose folder"}</span>
              </button>
            </section>

            <section className="space-y-3">
              <PanelTitle icon={<Monitor size={17} />} title="Source" />
              <div className="source-list">
                {sources.map((source) => (
                  <button
                    className={`source-card ${
                      selectedSourceId === source.id ? "source-card-selected" : ""
                    }`}
                    key={source.id}
                    type="button"
                    onClick={() => setSelectedSourceId(source.id)}
                    disabled={!canStart}
                  >
                    <img src={source.thumbnail} alt="" />
                    <span>
                      {source.kind === "screen" ? <Monitor size={14} /> : <Video size={14} />}
                      {source.name}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <PanelTitle icon={<Settings2 size={17} />} title="Inputs" />
              <DeviceControl
                icon={<Mic size={16} />}
                label="Microphone"
                enabled={micEnabled}
                onEnabledChange={setMicEnabled}
                value={selectedMicId}
                options={microphones}
                onValueChange={setSelectedMicId}
                disabled={!canStart}
              />
              <DeviceControl
                icon={<Camera size={16} />}
                label="Camera"
                enabled={cameraEnabled}
                onEnabledChange={setCameraEnabled}
                value={selectedCameraId}
                options={cameras}
                onValueChange={setSelectedCameraId}
                disabled={!canStart}
              />
            </section>

            <section className="space-y-3">
              {state === "recording" ? (
                <button
                  className="danger-button w-full"
                  type="button"
                  onClick={() => void stopRecording()}
                >
                  <CircleStop size={18} />
                  <span>Stop recording</span>
                </button>
              ) : (
                <button
                  className="primary-button w-full"
                  type="button"
                  onClick={() => void startRecording()}
                  disabled={!canStart}
                >
                  <ScreenShare size={18} />
                  <span>Start recording</span>
                </button>
              )}
              <div className="metric-grid">
                <Metric label="Elapsed" value={formatDuration(elapsedMs)} />
                <Metric label="Tracks" value={trackSummary(project)} />
              </div>
            </section>
          </aside>

          <section className="preview-shell">
            <div className="preview-stage">
              {state === "recording" || state === "stopping" ? (
                <LivePreview
                  screenRef={screenPreviewRef}
                  cameraRef={cameraPreviewRef}
                  cameraEnabled={Boolean(cameraStreamRef.current)}
                />
              ) : project?.status === "complete" ? (
                <PreviewPlayer project={project} />
              ) : (
                <EmptyPreview selectedSource={selectedSource} />
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function PanelTitle(props: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
      {props.icon}
      <span>{props.title}</span>
    </div>
  );
}

function DeviceControl(props: {
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  value: string | null;
  options: DeviceOption[];
  onValueChange: (value: string | null) => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-zinc-200">
          {props.icon}
          {props.label}
        </label>
        <input
          type="checkbox"
          checked={props.enabled}
          onChange={(event) => props.onEnabledChange(event.target.checked)}
          disabled={props.disabled}
        />
      </div>
      <select
        className="select-input"
        value={props.value ?? ""}
        onChange={(event) => props.onValueChange(event.target.value || null)}
        disabled={props.disabled || !props.enabled || props.options.length === 0}
      >
        {props.options.length === 0 ? (
          <option value="">No device found</option>
        ) : (
          props.options.map((option) => (
            <option key={option.deviceId} value={option.deviceId}>
              {option.label}
            </option>
          ))
        )}
      </select>
    </div>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-3">
      <div className="text-xs text-zinc-500">{props.label}</div>
      <div className="mt-1 text-sm font-medium text-zinc-100">{props.value}</div>
    </div>
  );
}

function StatusBadge(props: { state: RecorderState }) {
  const styles: Record<RecorderState, string> = {
    ready: "border-zinc-600 bg-zinc-800 text-zinc-200",
    selecting: "border-cyan-400/40 bg-cyan-500/10 text-cyan-100",
    recording: "border-red-400/40 bg-red-500/10 text-red-100",
    stopping: "border-amber-400/40 bg-amber-500/10 text-amber-100",
    processing: "border-indigo-400/40 bg-indigo-500/10 text-indigo-100",
    complete: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
    failed: "border-red-400/40 bg-red-500/10 text-red-100"
  };

  return (
    <div className={`rounded-full border px-3 py-1 text-xs font-medium ${styles[props.state]}`}>
      {props.state}
    </div>
  );
}

function EmptyPreview(props: { selectedSource: SourceSummary | null }) {
  return (
    <div className="empty-preview">
      <div className="empty-preview-icon">
        <Wand2 size={28} />
      </div>
      <h2>{props.selectedSource ? props.selectedSource.name : "Choose a source"}</h2>
      <p>
        Select a display or window, choose a project folder, then start recording.
      </p>
    </div>
  );
}

function LivePreview(props: {
  screenRef: React.RefObject<HTMLVideoElement | null>;
  cameraRef: React.RefObject<HTMLVideoElement | null>;
  cameraEnabled: boolean;
}) {
  return (
    <div className="live-composition">
      <video
        ref={props.screenRef}
        className="screen-video"
        muted
        autoPlay
        playsInline
      />
      {props.cameraEnabled ? (
        <video
          ref={props.cameraRef}
          className="camera-bubble"
          muted
          autoPlay
          playsInline
        />
      ) : null}
      <div className="recording-pill">
        <span />
        Recording
      </div>
    </div>
  );
}

function PreviewPlayer(props: { project: ProjectView }) {
  const screenRef = useRef<HTMLVideoElement | null>(null);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState((props.project.durationMs ?? 0) / 1000);
  const [currentTime, setCurrentTime] = useState(0);

  const screenUrl = props.project.mediaUrls.screen;
  const cameraUrl = props.project.mediaUrls.camera;
  const audioUrl = props.project.mediaUrls.micWav ?? props.project.mediaUrls.micWebm;

  function mediaElements(): HTMLMediaElement[] {
    return [screenRef.current, cameraRef.current, audioRef.current].filter(
      (item): item is HTMLMediaElement => Boolean(item)
    );
  }

  async function togglePlay() {
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

  return (
    <div className="review-layout">
      <div className="review-composition">
        {screenUrl ? (
          <video
            ref={screenRef}
            className="screen-video"
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
        ) : null}
        {cameraUrl ? (
          <video ref={cameraRef} className="camera-bubble" src={cameraUrl} playsInline />
        ) : null}
        {audioUrl ? <audio ref={audioRef} src={audioUrl} /> : null}
        <div className="complete-pill">
          <CheckCircle2 size={15} />
          Saved to {shortPath(props.project.rootPath)}
        </div>
      </div>

      <div className="playback-controls">
        <button className="icon-button" type="button" onClick={() => void togglePlay()}>
          {playing ? <CircleStop size={18} /> : <Play size={18} />}
        </button>
        <span className="time-label">{formatSeconds(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(duration, 0)}
          step={0.05}
          value={Math.min(currentTime, duration || 0)}
          onChange={(event) => seek(Number(event.target.value))}
        />
        <span className="time-label">{formatSeconds(duration)}</span>
      </div>
    </div>
  );
}

function createRecorders(input: {
  screenStream: MediaStream;
  cameraStream: MediaStream | null;
  micStream: MediaStream | null;
  screenMimeType: string;
  cameraMimeType: string | null;
  micMimeType: string | null;
  onChunk: (track: RecordingTrack, blob: Blob) => void;
  onError: (error: unknown) => void;
}): RecorderMap {
  const recorders: RecorderMap = {
    screen: createRecorder(input.screenStream, input.screenMimeType, (blob) =>
      input.onChunk("screen", blob)
    )
  };

  if (input.cameraStream && input.cameraMimeType) {
    recorders.camera = createRecorder(input.cameraStream, input.cameraMimeType, (blob) =>
      input.onChunk("camera", blob)
    );
  }

  if (input.micStream && input.micMimeType) {
    recorders.mic = createRecorder(input.micStream, input.micMimeType, (blob) =>
      input.onChunk("mic", blob)
    );
  }

  Object.values(recorders).forEach((recorder) => {
    if (recorder) {
      recorder.onerror = (event) => input.onError(event);
    }
  });

  return recorders;
}

function createRecorder(
  stream: MediaStream,
  mimeType: string,
  onChunk: (blob: Blob) => void
): MediaRecorder {
  const recorder = new MediaRecorder(stream, { mimeType });
  recorder.ondataavailable = (event) => onChunk(event.data);
  return recorder;
}

function stopRecorder(recorder: MediaRecorder): Promise<void> {
  if (recorder.state === "inactive") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    recorder.addEventListener("stop", () => resolve(), { once: true });
    recorder.addEventListener(
      "error",
      (event) => reject(new Error(`Recorder failed: ${event.type}`)),
      { once: true }
    );
    recorder.stop();
  });
}

function getSupportedMimeType(candidates: string[]): string {
  const supported = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));

  if (!supported) {
    throw new Error("This version of Chromium cannot record WebM media.");
  }

  return supported;
}

function createProjectDevices(input: {
  microphones: DeviceOption[];
  cameras: DeviceOption[];
  micEnabled: boolean;
  cameraEnabled: boolean;
  selectedMicId: string | null;
  selectedCameraId: string | null;
}): ProjectDevices {
  return {
    microphone: createDeviceSelection(
      input.micEnabled,
      input.selectedMicId,
      input.microphones
    ),
    camera: createDeviceSelection(input.cameraEnabled, input.selectedCameraId, input.cameras)
  };
}

function createDeviceSelection(
  enabled: boolean,
  deviceId: string | null,
  options: DeviceOption[]
): DeviceSelection {
  const match = options.find((option) => option.deviceId === deviceId);

  return {
    enabled,
    deviceId: enabled ? deviceId : null,
    label: enabled ? match?.label ?? null : null
  };
}

function trackSummary(project: ProjectView | null): string {
  if (!project) {
    return "None";
  }

  const count = Object.values(project.tracks).filter(Boolean).length;
  return `${count} track${count === 1 ? "" : "s"}`;
}

function formatDuration(ms: number): string {
  return formatSeconds(ms / 1000);
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

function shortPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts.length > 2 ? `.../${parts.slice(-2).join("/")}` : filePath;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
