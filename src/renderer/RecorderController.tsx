import {
  CheckCircle2,
  CircleStop,
  FolderOpen,
  Menu,
  Mic,
  MicOff,
  Minimize2,
  Video,
  VideoOff,
  X
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

type FloatingState =
  | "ready"
  | "preparing"
  | "countdown"
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

export function RecorderController() {
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [baseDirectory, setBaseDirectory] = useState<string | null>(null);
  const [microphones, setMicrophones] = useState<DeviceOption[]>([]);
  const [cameras, setCameras] = useState<DeviceOption[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [state, setState] = useState<FloatingState>("ready");
  const [countdown, setCountdown] = useState(3);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectView | null>(null);
  const [compact, setCompact] = useState(false);

  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recordersRef = useRef<RecorderMap>({});
  const writeQueuesRef = useRef<WriteQueues>({});
  const projectRef = useRef<ProjectView | null>(null);
  const stateRef = useRef<FloatingState>("ready");
  const recordingStartedAtRef = useRef<number | null>(null);
  const stoppingRef = useRef(false);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId, sources]
  );
  const selectedCameraLabel = getDeviceLabel(cameras, selectedCameraId, "Camera");
  const canStart = state === "ready" || state === "complete" || state === "failed";
  const shouldShowSelectionOverlay =
    state === "ready" ||
    state === "preparing" ||
    state === "countdown" ||
    state === "complete" ||
    state === "failed";

  const refreshSources = useCallback(async () => {
    const nextSources = await window.openVideoCraft.sources.list();
    setSources(nextSources);
    setSelectedSourceId((current) => {
      if (
        current &&
        nextSources.some((source) => source.id === current && source.kind === "screen")
      ) {
        return current;
      }

      return nextSources.find((source) => source.kind === "screen")?.id ?? nextSources[0]?.id ?? null;
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
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const dispose = window.openVideoCraft.events.onGlobalStop(() => {
      if (stateRef.current === "recording") {
        void stopRecording();
      }
    });

    return dispose;
  }, []);

  useEffect(() => {
    if (!selectedSource || !shouldShowSelectionOverlay) {
      void window.openVideoCraft.overlays.hideSourceBorder();
      return;
    }

    void window.openVideoCraft.capture.selectDisplaySource(selectedSource.id);

    if (selectedSource.kind === "screen") {
      void window.openVideoCraft.overlays.showSourceBorder(selectedSource.id);
    } else {
      void window.openVideoCraft.overlays.hideSourceBorder();
    }

    return () => {
      void window.openVideoCraft.overlays.hideSourceBorder();
    };
  }, [selectedSource, shouldShowSelectionOverlay]);

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

  async function chooseFolder() {
    const folder = await window.openVideoCraft.projects.chooseBaseDirectory();

    if (folder) {
      setBaseDirectory(folder);
    }
  }

  async function setCompactMode(nextCompact: boolean) {
    setCompact(nextCompact);
    await window.openVideoCraft.windows.setRecorderCompact(nextCompact);
  }

  async function startRecording() {
    if (!selectedSource) {
      setErrorMessage("No screen is available to record.");
      return;
    }

    setState("preparing");
    setErrorMessage(null);
    stoppingRef.current = false;
    writeQueuesRef.current = {};

    try {
      const folder = baseDirectory ?? (await window.openVideoCraft.projects.chooseBaseDirectory());
      if (!folder) {
        setState("ready");
        setErrorMessage("Choose a save folder before recording.");
        return;
      }

      setBaseDirectory(folder);
      await window.openVideoCraft.capture.selectDisplaySource(selectedSource.id);

      if (selectedSource.kind === "screen") {
        await window.openVideoCraft.overlays.showSourceBorder(selectedSource.id);
      }

      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 30
        },
        audio: false
      });

      const cameraStream = await getOptionalCameraStream(
        cameraEnabled,
        selectedCameraId,
        selectedCameraLabel
      );
      const micStream = await getOptionalMicStream(micEnabled, selectedMicId, setErrorMessage);

      const screenMimeType = getSupportedMimeType(videoMimeCandidates);
      const cameraMimeType = cameraStream ? getSupportedMimeType(videoMimeCandidates) : null;
      const micMimeType = micStream ? getSupportedMimeType(audioMimeCandidates) : null;

      const createdProject = await window.openVideoCraft.projects.create({
        name: `Floating Recording ${new Date().toLocaleString()}`,
        baseDirectory: folder
      });
      const source: ProjectSource = {
        id: selectedSource.id,
        name: selectedSource.name,
        kind: selectedSource.kind,
        displayId: selectedSource.displayId
      };
      const devices = createProjectDevices({
        microphones,
        cameras,
        micEnabled: Boolean(micStream),
        cameraEnabled: Boolean(cameraStream),
        selectedMicId,
        selectedCameraId
      });
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

      screenStreamRef.current = screenStream;
      cameraStreamRef.current = cameraStream;
      micStreamRef.current = micStream;
      setProject(startedProject);
      projectRef.current = startedProject;

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

      setState("countdown");
      await runCountdown(setCountdown);
      await window.openVideoCraft.overlays.hideSourceBorder();
      await window.openVideoCraft.windows.hideCurrent();

      recordingStartedAtRef.current = Date.now();
      setElapsedMs(0);
      setState("recording");
      Object.values(recordersRef.current).forEach((recorder) => recorder?.start(1000));
      await refreshDevices();
    } catch (error) {
      stopAllStreams();
      await window.openVideoCraft.overlays.hideSourceBorder();
      setState("failed");
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function stopRecording() {
    if (stoppingRef.current || stateRef.current !== "recording") {
      return;
    }

    stoppingRef.current = true;
    setState("stopping");
    await window.openVideoCraft.windows.showCurrent();

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
    await window.openVideoCraft.overlays.hideSourceBorder();
    await window.openVideoCraft.windows.showCurrent();
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
        // Keep the original error visible.
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
  }

  if (compact) {
    return (
      <main className="floating-recorder-root floating-recorder-root-compact">
        <button
          className="floating-compact-pill app-no-drag"
          type="button"
          onClick={() => void setCompactMode(false)}
          title="Restore recorder"
        >
          <span
            className={`floating-compact-dot ${
              state === "recording" ? "floating-compact-dot-recording" : ""
            }`}
          />
          <span>{state === "recording" ? formatDuration(elapsedMs) : "Open Video Craft"}</span>
        </button>
      </main>
    );
  }

  return (
    <main className="floating-recorder-root">
      <section className="floating-recorder-card">
        <div className="floating-titlebar app-drag">
          <div className="floating-title">
            <button className="floating-title-icon app-no-drag" type="button" title="Menu">
              <Menu size={24} />
            </button>
            <span>Open Video Craft</span>
          </div>
          <div className="floating-title-actions app-no-drag">
            <button
              type="button"
              title="Collapse"
              onClick={() => void setCompactMode(true)}
            >
              <Minimize2 size={20} />
            </button>
            <button
              type="button"
              title="Close"
              onClick={() => void window.openVideoCraft.windows.closeCurrent()}
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {errorMessage ? (
          <div className="floating-error">
            <button
              className="floating-error-close"
              type="button"
              onClick={() => setErrorMessage(null)}
              title="Dismiss"
            >
              <X size={24} />
            </button>
            <div className="floating-error-title">Error</div>
            <p>{errorMessage}</p>
          </div>
        ) : null}

        <div className="floating-record-area">
          {state === "complete" ? (
            <div className="floating-complete">
              <CheckCircle2 size={28} />
              <span>Saved</span>
              <small>{project ? shortPath(project.rootPath) : ""}</small>
            </div>
          ) : null}

          <button
            className={`floating-record-button ${
              state === "recording" ? "floating-recording" : ""
            }`}
            type="button"
            disabled={
              state === "preparing" ||
              state === "countdown" ||
              state === "processing" ||
              state === "stopping"
            }
            onClick={() => {
              if (state === "recording") {
                void stopRecording();
              } else {
                void startRecording();
              }
            }}
            title={state === "recording" ? "Stop recording" : "Start recording"}
          >
            {state === "countdown" ? countdown : state === "recording" ? <CircleStop size={34} /> : null}
          </button>

          <div className="floating-status">
            {state === "recording"
              ? `${formatDuration(elapsedMs)} - Ctrl+Shift+S to stop`
              : state === "countdown"
                ? "Starting"
                : state === "processing"
                  ? "Processing audio"
                  : state === "preparing"
                    ? "Preparing"
                    : selectedSource
                      ? `Recording screen: ${selectedSource.name}`
                      : "No screen found"}
          </div>
        </div>

        <footer className="floating-footer">
          <button
            className="floating-footer-control"
            type="button"
            onClick={() => setMicEnabled((enabled) => !enabled)}
            disabled={!canStart}
          >
            {micEnabled ? <Mic size={25} /> : <MicOff size={25} />}
            <span>{micEnabled ? "Mic on" : "Mic off"}</span>
          </button>

          <button
            className="floating-footer-control"
            type="button"
            onClick={() => void chooseFolder()}
            disabled={!canStart}
            title={baseDirectory ?? "Choose project folder"}
          >
            <FolderOpen size={25} />
            <span>{baseDirectory ? "Project set" : "Project"}</span>
          </button>

          <button
            className="floating-footer-control"
            type="button"
            onClick={() => setCameraEnabled((enabled) => !enabled)}
            disabled={!canStart}
          >
            {cameraEnabled ? <Video size={25} /> : <VideoOff size={25} />}
            <span>{cameraEnabled ? truncateLabel(selectedCameraLabel) : "Camera off"}</span>
          </button>
        </footer>
      </section>
    </main>
  );
}

async function runCountdown(setCountdown: (value: number) => void): Promise<void> {
  for (let value = 3; value >= 1; value -= 1) {
    setCountdown(value);
    await delay(1000);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function getOptionalCameraStream(
  enabled: boolean,
  deviceId: string | null,
  label: string
): Promise<MediaStream | null> {
  if (!enabled || !deviceId) {
    return null;
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: {
          exact: deviceId
        }
      },
      audio: false
    });
  } catch {
    throw new Error(
      `The camera "${label}" is not sending video. Choose another camera or disable camera recording.`
    );
  }
}

async function getOptionalMicStream(
  enabled: boolean,
  deviceId: string | null,
  setErrorMessage: (message: string) => void
): Promise<MediaStream | null> {
  if (!enabled || !deviceId) {
    return null;
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        deviceId: {
          exact: deviceId
        }
      }
    });
  } catch {
    setErrorMessage("The selected microphone is not available. Recording will continue without microphone audio.");
    return null;
  }
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

function getDeviceLabel(options: DeviceOption[], value: string | null, fallback: string): string {
  return options.find((option) => option.deviceId === value)?.label ?? fallback;
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function shortPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts.length > 2 ? `.../${parts.slice(-2).join("/")}` : filePath;
}

function truncateLabel(value: string): string {
  return value.length > 14 ? `${value.slice(0, 13)}...` : value;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
