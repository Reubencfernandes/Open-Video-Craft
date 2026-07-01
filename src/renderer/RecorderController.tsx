import {
  CheckCircle2,
  CircleStop,
  FolderOpen,
  Menu,
  Mic,
  MicOff,
  Minimize2,
  Pause,
  Play,
  Video,
  VideoOff,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  DeviceSelection,
  ProjectDevices,
  ProjectSource,
  ProjectView,
  RecordingTrack,
  SourceSummary
} from "../shared/types";
import {
  createDisplayCaptureOptions,
  createMediaRecorderOptions,
  recordingRuntime,
  type RecorderKind
} from "./recording-runtime";

type FloatingState =
  | "ready"
  | "preparing"
  | "countdown"
  | "recording"
  | "paused"
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
  const [cameraEnabled, setCameraEnabled] = useState(false);
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
  const activeRecordedMsRef = useRef(0);
  const activeSegmentStartedAtRef = useRef<number | null>(null);
  const lastProjectUiSyncAtRef = useRef(0);
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
    setSelectedMicId((current) =>
      current && nextMicrophones.some((device) => device.deviceId === current)
        ? current
        : nextMicrophones[0]?.deviceId ?? null
    );
    setSelectedCameraId((current) =>
      current && nextCameras.some((device) => device.deviceId === current)
        ? current
        : nextCameras[0]?.deviceId ?? null
    );
    setMicEnabled((enabled) => (nextMicrophones.length > 0 ? enabled : false));
    setCameraEnabled((enabled) => (nextCameras.length > 0 ? enabled : false));
  }, []);

  useEffect(() => {
    void refreshSources().catch((error) => setErrorMessage(toErrorMessage(error)));
    void refreshDevices().catch(() => undefined);
  }, [refreshDevices, refreshSources]);

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) {
      return undefined;
    }

    const handleDeviceChange = () => {
      void refreshDevices().catch(() => undefined);
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [refreshDevices]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const dispose = window.openVideoCraft.events.onGlobalStop(() => {
      if (stateRef.current === "recording" || stateRef.current === "paused") {
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
      setElapsedMs(getCurrentRecordedDurationMs());
    }, recordingRuntime.elapsedUpdateMs);

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

  function pauseRecording() {
    if (stateRef.current !== "recording") {
      return;
    }

    for (const recorder of Object.values(recordersRef.current)) {
      if (recorder?.state === "recording") {
        recorder.pause();
      }
    }

    activeRecordedMsRef.current = getCurrentRecordedDurationMs();
    activeSegmentStartedAtRef.current = null;
    setElapsedMs(activeRecordedMsRef.current);
    setState("paused");
  }

  function resumeRecording() {
    if (stateRef.current !== "paused") {
      return;
    }

    for (const recorder of Object.values(recordersRef.current)) {
      if (recorder?.state === "paused") {
        recorder.resume();
      }
    }

    activeSegmentStartedAtRef.current = Date.now();
    setState("recording");
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

      const screenStream = await navigator.mediaDevices.getDisplayMedia(
        createDisplayCaptureOptions()
      );

      const cameraStream = await getOptionalCameraStream(cameraEnabled, selectedCameraId);
      const micStream = await getOptionalMicStream(micEnabled, selectedMicId);

      if (!cameraStream) {
        setCameraEnabled(false);
      }

      if (!micStream) {
        setMicEnabled(false);
      }

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

      activeRecordedMsRef.current = 0;
      activeSegmentStartedAtRef.current = Date.now();
      lastProjectUiSyncAtRef.current = Date.now();
      setElapsedMs(0);
      setState("recording");
      Object.values(recordersRef.current).forEach((recorder) =>
        recorder?.start(recordingRuntime.chunkMs)
      );
      await refreshDevices();
    } catch (error) {
      stopAllStreams();
      await window.openVideoCraft.overlays.hideSourceBorder();
      setState("failed");
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function stopRecording() {
    if (
      stoppingRef.current ||
      (stateRef.current !== "recording" && stateRef.current !== "paused")
    ) {
      return;
    }

    stoppingRef.current = true;
    const durationMs = getCurrentRecordedDurationMs();
    activeRecordedMsRef.current = durationMs;
    activeSegmentStartedAtRef.current = null;
    setState("stopping");
    await window.openVideoCraft.windows.showCurrent();
    await setCompactMode(false);

    const currentProject = projectRef.current;

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
      await window.openVideoCraft.windows.openEditor(preparedProject.id);
      await refreshSources();
    } catch (error) {
      await failRecording(toErrorMessage(error));
    }
  }

  async function cancelRecording() {
    if (
      stoppingRef.current ||
      (stateRef.current !== "recording" && stateRef.current !== "paused")
    ) {
      return;
    }

    stoppingRef.current = true;
    setState("stopping");

    try {
      await Promise.all(
        Object.values(recordersRef.current).map((recorder) =>
          recorder ? stopRecorder(recorder) : Promise.resolve()
        )
      );
      await Promise.all(Object.values(writeQueuesRef.current));
      stopAllStreams();
      await window.openVideoCraft.overlays.hideSourceBorder();
      await setCompactMode(false);

      const currentProject = projectRef.current;
      if (currentProject) {
        await window.openVideoCraft.projects.discard(currentProject.id);
      }

      projectRef.current = null;
      setProject(null);
      activeRecordedMsRef.current = 0;
      activeSegmentStartedAtRef.current = null;
      setElapsedMs(0);
      stoppingRef.current = false;
      setState("ready");
      await refreshSources();
    } catch (error) {
      await failRecording(toErrorMessage(error));
    }
  }

  async function failRecording(message: string) {
    stopAllStreams();
    await window.openVideoCraft.overlays.hideSourceBorder();
    await window.openVideoCraft.windows.showCurrent();
    await setCompactMode(false);
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
      projectRef.current = updatedProject;

      const now = Date.now();
      if (now - lastProjectUiSyncAtRef.current >= recordingRuntime.projectUiSyncMs) {
        setProject(updatedProject);
        lastProjectUiSyncAtRef.current = now;
      }
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

  function getCurrentRecordedDurationMs(): number {
    const segmentStartedAt = activeSegmentStartedAtRef.current;

    if (!segmentStartedAt) {
      return activeRecordedMsRef.current;
    }

    return activeRecordedMsRef.current + Date.now() - segmentStartedAt;
  }

  if (compact) {
    return (
      <main className="floating-recorder-root floating-recorder-root-compact">
        <div className="floating-compact-pill app-drag">
          <button
            className="floating-compact-restore app-no-drag"
            type="button"
            onClick={() => void setCompactMode(false)}
            title="Restore recorder"
          >
            <span
              className={`floating-compact-dot ${
                state === "recording" || state === "paused"
                  ? "floating-compact-dot-recording"
                  : ""
              }`}
            />
            <span>{state === "paused" ? "Paused" : formatDuration(elapsedMs)}</span>
          </button>

          {state === "recording" || state === "paused" ? (
            <div className="floating-compact-actions app-no-drag">
              <button
                type="button"
                onClick={state === "paused" ? resumeRecording : pauseRecording}
                title={state === "paused" ? "Resume recording" : "Pause recording"}
              >
                {state === "paused" ? <Play size={17} /> : <Pause size={17} />}
              </button>
              <button
                className="floating-compact-stop"
                type="button"
                onClick={() => void stopRecording()}
                title="Stop recording"
              >
                <CircleStop size={18} />
              </button>
            </div>
          ) : null}
        </div>
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
              state === "recording" || state === "paused" ? "floating-recording" : ""
            }`}
            type="button"
            disabled={
              state === "preparing" ||
              state === "countdown" ||
              state === "processing" ||
              state === "stopping"
            }
            onClick={() => {
              if (state === "recording" || state === "paused") {
                void stopRecording();
              } else {
                void startRecording();
              }
            }}
            title={state === "recording" || state === "paused" ? "Stop recording" : "Start recording"}
          >
            {state === "countdown" ? countdown : state === "recording" || state === "paused" ? <CircleStop size={34} /> : null}
          </button>

          {state === "recording" || state === "paused" ? (
            <div className="floating-record-controls">
              <button
                type="button"
                onClick={state === "paused" ? resumeRecording : pauseRecording}
              >
                {state === "paused" ? <Play size={17} /> : <Pause size={17} />}
                <span>{state === "paused" ? "Resume" : "Pause"}</span>
              </button>
              <button
                className="floating-record-cancel"
                type="button"
                onClick={() => void cancelRecording()}
              >
                <X size={17} />
                <span>Cancel</span>
              </button>
              <button
                className="floating-record-done"
                type="button"
                onClick={() => void stopRecording()}
              >
                <CheckCircle2 size={17} />
                <span>Done</span>
              </button>
            </div>
          ) : null}

          <div className="floating-status">
            {state === "recording"
              ? `${formatDuration(elapsedMs)} - recording`
              : state === "paused"
                ? `${formatDuration(elapsedMs)} - paused`
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
          <FloatingDeviceControl
            enabled={micEnabled}
            enabledIcon={<Mic size={25} />}
            disabledIcon={<MicOff size={25} />}
            enabledLabel="Mic on"
            disabledLabel="Mic off"
            options={microphones}
            value={selectedMicId}
            disabled={!canStart}
            onToggle={() =>
              setMicEnabled((enabled) => (microphones.length > 0 ? !enabled : false))
            }
            onValueChange={setSelectedMicId}
          />

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

          <FloatingDeviceControl
            enabled={cameraEnabled}
            enabledIcon={<Video size={25} />}
            disabledIcon={<VideoOff size={25} />}
            enabledLabel={truncateLabel(selectedCameraLabel)}
            disabledLabel="Camera off"
            options={cameras}
            value={selectedCameraId}
            disabled={!canStart}
            onToggle={() =>
              setCameraEnabled((enabled) => (cameras.length > 0 ? !enabled : false))
            }
            onValueChange={setSelectedCameraId}
          />
        </footer>
      </section>
    </main>
  );
}

function FloatingDeviceControl(props: {
  enabled: boolean;
  enabledIcon: ReactNode;
  disabledIcon: ReactNode;
  enabledLabel: string;
  disabledLabel: string;
  options: DeviceOption[];
  value: string | null;
  disabled: boolean;
  onToggle: () => void;
  onValueChange: (value: string | null) => void;
}) {
  return (
    <div className="floating-footer-control floating-device-control">
      <button
        className="floating-device-toggle"
        type="button"
        onClick={props.onToggle}
        disabled={props.disabled}
      >
        {props.enabled ? props.enabledIcon : props.disabledIcon}
        <span>{props.enabled ? props.enabledLabel : props.disabledLabel}</span>
      </button>
      {props.enabled && props.options.length > 1 ? (
        <select
          className="floating-device-select"
          value={props.value ?? ""}
          onChange={(event) => props.onValueChange(event.target.value || null)}
          disabled={props.disabled}
        >
          {props.options.map((option) => (
            <option key={option.deviceId} value={option.deviceId}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
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
  deviceId: string | null
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
    return null;
  }
}

async function getOptionalMicStream(
  enabled: boolean,
  deviceId: string | null
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
    screen: createRecorder(
      input.screenStream,
      input.screenMimeType,
      (blob) => input.onChunk("screen", blob),
      "video"
    )
  };

  if (input.cameraStream && input.cameraMimeType) {
    recorders.camera = createRecorder(
      input.cameraStream,
      input.cameraMimeType,
      (blob) => input.onChunk("camera", blob),
      "video"
    );
  }

  if (input.micStream && input.micMimeType) {
    recorders.mic = createRecorder(
      input.micStream,
      input.micMimeType,
      (blob) => input.onChunk("mic", blob),
      "audio"
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
  onChunk: (blob: Blob) => void,
  kind: RecorderKind
): MediaRecorder {
  const recorder = new MediaRecorder(stream, createMediaRecorderOptions(kind, mimeType));
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
