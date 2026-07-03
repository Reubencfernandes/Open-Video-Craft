import {
  CheckCircle2,
  CircleStop,
  Eye,
  EyeOff,
  FolderOpen,
  Mic,
  MicOff,
  Minimize2,
  Pause,
  Play,
  Video,
  VideoOff,
  X
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
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
import appLogo from "./assets/app.png";
import { cx } from "./classNames";

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
  const [borderOverlayEnabled, setBorderOverlayEnabled] = useState(true);

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
  // The border stays visible while recording as an on-screen indicator; the
  // overlay window is content-protected, so it never appears in the capture.
  const shouldShowSelectionOverlay =
    borderOverlayEnabled &&
    (state === "ready" ||
      state === "preparing" ||
      state === "countdown" ||
      state === "recording" ||
      state === "paused");
  const overlaySourceId =
    shouldShowSelectionOverlay && selectedSource?.kind === "screen"
      ? selectedSource.id
      : null;

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
    if (!selectedSourceId) {
      return;
    }

    void window.openVideoCraft.capture
      .selectDisplaySource(selectedSourceId)
      .catch(() => undefined);
  }, [selectedSourceId]);

  // Single source of truth for the screen border overlay: visible whenever a
  // screen source is selected, the eye toggle is on, and the recorder is in a
  // selection or recording state.
  useEffect(() => {
    if (!overlaySourceId) {
      void window.openVideoCraft.overlays.hideSourceBorder();
      return;
    }

    void window.openVideoCraft.overlays.showSourceBorder(overlaySourceId);

    return () => {
      void window.openVideoCraft.overlays.hideSourceBorder();
    };
  }, [overlaySourceId]);

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
    await window.openVideoCraft.overlays.hideSourceBorder();
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
      <main className="floating-recorder-root floating-recorder-root-compact grid size-full place-items-center bg-transparent">
        <div className="floating-compact-pill app-drag inline-flex h-full w-full items-center justify-between gap-3 rounded-full border border-white/15 bg-slate-950/95 py-0 pl-4 pr-2 font-bold text-white shadow-2xl">
          <button
            className="floating-compact-restore app-no-drag inline-flex min-w-0 flex-1 items-center gap-3 border-0 bg-transparent font-bold text-white"
            type="button"
            onClick={() => void setCompactMode(false)}
            title="Restore recorder"
          >
            <span
              className={cx(
                "floating-compact-dot size-3.5 flex-none rounded-full bg-cyan-500 shadow-[0_0_0_4px_rgb(6_182_212_/_0.14)]",
                (state === "recording" || state === "paused") &&
                  "floating-compact-dot-recording bg-red-500 shadow-[0_0_0_4px_rgb(248_60_72_/_0.18)]"
              )}
            />
            <span className="truncate">{state === "paused" ? "Paused" : formatDuration(elapsedMs)}</span>
          </button>

          {state === "recording" || state === "paused" ? (
            <div className="floating-compact-actions app-no-drag inline-flex flex-none items-center gap-1.5">
              <button
                className="grid size-9 place-items-center rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/15"
                type="button"
                onClick={state === "paused" ? resumeRecording : pauseRecording}
                title={state === "paused" ? "Resume recording" : "Pause recording"}
              >
                {state === "paused" ? <Play size={17} /> : <Pause size={17} />}
              </button>
              <button
                className="floating-compact-stop grid size-9 place-items-center rounded-full border border-red-300/30 bg-red-600 text-white hover:bg-red-700"
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
    <main className="floating-recorder-root grid size-full place-items-center bg-transparent">
      <section className="floating-recorder-card flex h-[460px] w-[430px] flex-col overflow-hidden rounded-[9px] border border-white/15 bg-[#121317] text-white shadow-[0_24px_62px_rgb(0_0_0_/_0.42)]">
        <div className="floating-titlebar app-drag flex h-12 flex-none items-center justify-between border-b border-white/[0.07] px-4">
          <div className="floating-title inline-flex min-w-0 items-center gap-2.5 text-[0.82rem] font-extrabold">
            <img src={appLogo} alt="" />
            <span>Open Video Craft</span>
          </div>
          <div className="floating-title-actions app-no-drag inline-flex items-center gap-1">
            <button
              className="grid size-8 place-items-center rounded-md border-0 bg-transparent text-slate-300 hover:bg-white/10 hover:text-white"
              type="button"
              title={borderOverlayEnabled ? "Hide screen border" : "Show screen border"}
              onClick={() => setBorderOverlayEnabled((value) => !value)}
            >
              {borderOverlayEnabled ? <Eye size={19} /> : <EyeOff size={19} />}
            </button>
            <button
              className="grid size-8 place-items-center rounded-md border-0 bg-transparent text-slate-300 hover:bg-white/10 hover:text-white"
              type="button"
              title="Collapse"
              onClick={() => void setCompactMode(true)}
            >
              <Minimize2 size={20} />
            </button>
            <button
              className="grid size-8 place-items-center rounded-md border-0 bg-transparent text-slate-300 hover:bg-white/10 hover:text-white"
              type="button"
              title="Close"
              onClick={() => void window.openVideoCraft.windows.closeCurrent()}
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {errorMessage ? (
          <div className="floating-error relative m-4 rounded-lg border border-red-400/35 bg-red-950/70 p-4 pr-12 text-red-50">
            <button
              className="floating-error-close absolute right-3 top-3 grid size-8 place-items-center rounded-md border-0 bg-transparent text-white hover:bg-white/10"
              type="button"
              onClick={() => setErrorMessage(null)}
              title="Dismiss"
            >
              <X size={24} />
            </button>
            <div className="floating-error-title mb-2 text-base font-bold">Error</div>
            <p className="m-0 text-sm font-semibold leading-5">{errorMessage}</p>
          </div>
        ) : null}

        <div className="floating-record-area relative grid min-h-0 flex-1 place-items-center px-4 pb-6 pt-4">
          {state === "complete" ? (
            <div className="floating-complete absolute top-4 grid justify-items-center gap-1 text-emerald-300">
              <CheckCircle2 size={28} />
              <span className="text-sm font-extrabold">Saved</span>
              <small
                className="max-w-[360px] break-all text-center text-xs leading-4 text-slate-400"
                title={project?.rootPath ?? ""}
              >
                {project?.rootPath ?? ""}
              </small>
            </div>
          ) : null}

          <button
            className={cx(
              "floating-record-button grid size-[76px] place-items-center rounded-full border-0 bg-rose-600 text-3xl font-extrabold text-white transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-70",
              (state === "recording" || state === "paused") &&
                "floating-recording bg-red-700 hover:bg-red-800"
            )}
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
            <div className="floating-record-controls absolute bottom-14 inline-flex items-center gap-2">
              <button
                className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/15"
                type="button"
                onClick={state === "paused" ? resumeRecording : pauseRecording}
              >
                {state === "paused" ? <Play size={17} /> : <Pause size={17} />}
                <span>{state === "paused" ? "Resume" : "Pause"}</span>
              </button>
              <button
                className="floating-record-cancel inline-flex h-9 items-center gap-2 rounded-full border border-red-300/30 bg-red-500/15 px-4 text-sm font-bold text-red-100 hover:bg-red-500/25"
                type="button"
                onClick={() => void cancelRecording()}
              >
                <X size={17} />
                <span>Cancel</span>
              </button>
              <button
                className="floating-record-done inline-flex h-9 items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-500/15 px-4 text-sm font-bold text-emerald-100 hover:bg-emerald-500/25"
                type="button"
                onClick={() => void stopRecording()}
              >
                <CheckCircle2 size={17} />
                <span>Done</span>
              </button>
            </div>
          ) : null}

          <div className="floating-status absolute bottom-5 max-w-[86%] truncate text-center text-xs font-bold text-slate-400">
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

        <footer className="floating-footer grid grid-cols-3 gap-2 border-t border-white/[0.07] p-3">
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
            className="floating-footer-control grid min-h-16 place-items-center gap-1 rounded-lg border border-white/10 bg-white/[0.045] px-2 text-center text-[0.68rem] font-extrabold text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
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
    <div className="floating-footer-control floating-device-control grid min-h-16 place-items-center gap-1 rounded-lg border border-white/10 bg-white/[0.045] px-2 text-center text-[0.68rem] font-extrabold text-slate-200">
      <motion.button
        className="floating-device-toggle grid w-full min-w-0 place-items-center gap-1 border-0 bg-transparent text-inherit disabled:cursor-not-allowed disabled:opacity-45"
        type="button"
        onClick={props.onToggle}
        disabled={props.disabled}
        whileTap={props.disabled ? undefined : { scale: 0.88 }}
        transition={{ type: "spring", stiffness: 520, damping: 28 }}
      >
        <span className="floating-device-icon inline-flex min-h-7 items-center justify-center text-cyan-300">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={props.enabled ? "on" : "off"}
              initial={{ opacity: 0, scale: 0.5, rotate: -18 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.5, rotate: 18 }}
              transition={{ type: "spring", stiffness: 520, damping: 26 }}
              style={{ display: "inline-flex" }}
            >
              {props.enabled ? props.enabledIcon : props.disabledIcon}
            </motion.span>
          </AnimatePresence>
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={props.enabled ? props.enabledLabel : props.disabledLabel}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            {props.enabled ? props.enabledLabel : props.disabledLabel}
          </motion.span>
        </AnimatePresence>
      </motion.button>
      {props.enabled && props.options.length > 1 ? (
        <select
          className="floating-device-select h-7 w-full min-w-0 rounded-md border border-white/10 bg-slate-950/80 px-1.5 text-[0.65rem] text-slate-100"
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

function truncateLabel(value: string): string {
  return value.length > 14 ? `${value.slice(0, 13)}...` : value;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
