import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ProjectSource,
  ProjectView,
  RecordingTrack,
  SourceSummary
} from "../shared/types";
import {
  createDisplayCaptureOptions,
  recordingRuntime
} from "./recording-runtime";
import { RecorderControllerView } from "./recorder/RecorderControllerView";
import {
  audioMimeCandidates,
  createProjectDevices,
  createRecorders,
  getDeviceLabel,
  getOptionalCameraStream,
  getOptionalMicStream,
  getSupportedMimeType,
  runCountdown,
  stopRecorder,
  toErrorMessage,
  videoMimeCandidates
} from "./recorder/recorder-utils";
import { shouldShowSourceSelectionOverlay } from "./recorder/source-overlay-state";
import type {
  DeviceOption,
  FloatingState,
  RecorderMap,
  WriteQueues
} from "./recorder/types";

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
  // The border overlay windows are opaque and content-protected, so they can
  // stay visible through the whole recording without showing up in the video.
  const shouldShowSelectionOverlay = shouldShowSourceSelectionOverlay({
    borderOverlayEnabled,
    state,
    selectedSourceKind: selectedSource?.kind ?? null
  });
  const overlaySourceId = shouldShowSelectionOverlay ? selectedSource?.id ?? null : null;

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

  // Single source of truth for the screen border overlay: it is only visible
  // before capture starts, then hidden so it cannot cover the recorded screen.
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

  return (
    <RecorderControllerView
      compact={compact}
      state={state}
      countdown={countdown}
      elapsedMs={elapsedMs}
      errorMessage={errorMessage}
      projectRootPath={project?.rootPath ?? null}
      borderOverlayEnabled={borderOverlayEnabled}
      selectedSourceName={selectedSource?.name ?? null}
      baseDirectory={baseDirectory}
      microphones={microphones}
      cameras={cameras}
      selectedMicId={selectedMicId}
      selectedCameraId={selectedCameraId}
      selectedCameraLabel={selectedCameraLabel}
      micEnabled={micEnabled}
      cameraEnabled={cameraEnabled}
      canStart={canStart}
      onSetCompactMode={(nextCompact) => void setCompactMode(nextCompact)}
      onDismissError={() => setErrorMessage(null)}
      onToggleBorderOverlay={() => setBorderOverlayEnabled((value) => !value)}
      onClose={() => void window.openVideoCraft.windows.closeCurrent()}
      onStartRecording={() => void startRecording()}
      onStopRecording={() => void stopRecording()}
      onCancelRecording={() => void cancelRecording()}
      onPauseRecording={pauseRecording}
      onResumeRecording={resumeRecording}
      onChooseFolder={() => void chooseFolder()}
      onToggleMic={() =>
        setMicEnabled((enabled) => (microphones.length > 0 ? !enabled : false))
      }
      onToggleCamera={() =>
        setCameraEnabled((enabled) => (cameras.length > 0 ? !enabled : false))
      }
      onMicChange={setSelectedMicId}
      onCameraChange={setSelectedCameraId}
    />
  );
}
