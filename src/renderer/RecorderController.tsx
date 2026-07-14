/**
 * Floating recorder state machine: source/device selection, capture streams
 * (screen, camera, mic, system audio), MediaRecorder chunk writing over IPC,
 * pause/resume/stop/cancel, and the border-overlay lifecycle. Rendering is
 * delegated to recorder/RecorderControllerView.
 */
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
import {
  cameraQualityPresets,
  screenQualityPresets,
  type CameraQuality,
  type ScreenQuality
} from "./recorder/quality";
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
  const [cameraPreviewStream, setCameraPreviewStream] = useState<MediaStream | null>(null);
  const [screenQuality, setScreenQuality] = useState<ScreenQuality>("source");
  const [cameraQuality, setCameraQuality] = useState<CameraQuality>("720p");
  const [state, setState] = useState<FloatingState>("ready");
  const [countdown, setCountdown] = useState(3);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectView | null>(null);
  const [compact, setCompact] = useState(false);
  const [borderOverlayEnabled, setBorderOverlayEnabled] = useState(true);
  const [systemAudioEnabled, setSystemAudioEnabled] = useState(false);

  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const systemStreamRef = useRef<MediaStream | null>(null);
  const recordersRef = useRef<RecorderMap>({});
  const writeQueuesRef = useRef<WriteQueues>({});
  const projectRef = useRef<ProjectView | null>(null);
  const stateRef = useRef<FloatingState>("ready");
  const activeRecordedMsRef = useRef(0);
  const activeSegmentStartedAtRef = useRef<number | null>(null);
  const lastProjectUiSyncAtRef = useRef(0);
  const stoppingRef = useRef(false);
  const failingRef = useRef(false);
  const abortStartupRef = useRef(false);

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
      const current = stateRef.current;
      if (current === "recording" || current === "paused") {
        void stopRecording();
      } else if (current === "preparing" || current === "countdown") {
        // Stop arrived (global shortcut, or the main process racing a window
        // close) before MediaRecorder began. Flag it so startRecording discards
        // the just-created project at its next checkpoint instead of leaving it
        // stuck in status "recording" forever.
        abortStartupRef.current = true;
      }
    });

    return dispose;
  }, []);

  useEffect(() => {
    const disposeSuspend = window.openVideoCraft.events.onPowerSuspend(() => {
      const current = stateRef.current;
      if (current === "recording") {
        pauseRecording();
        setErrorMessage(
          "Recording was paused because the computer went to sleep. Review it, then resume when ready."
        );
      } else if (current === "preparing" || current === "countdown") {
        abortStartupRef.current = true;
        setErrorMessage("Recording setup was cancelled because the computer went to sleep.");
      }
    });
    const disposeResume = window.openVideoCraft.events.onPowerResume(() => {
      if (stateRef.current === "paused") {
        setErrorMessage("The computer resumed. Recording remains paused until you choose Resume.");
      }
    });
    return () => {
      disposeSuspend();
      disposeResume();
    };
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

  // Live camera preview while idle: whenever the camera is enabled and a device
  // is chosen (and we are not mid-capture), open the camera so the user can see
  // and frame their face before recording. During capture the recording stream
  // drives the preview instead, so this effect only owns and releases the idle
  // preview stream.
  useEffect(() => {
    if (!cameraEnabled || !selectedCameraId || state !== "ready") {
      return undefined;
    }

    let cancelled = false;
    let previewStream: MediaStream | null = null;

    void (async () => {
      const acquired = await getOptionalCameraStream(
        true,
        selectedCameraId,
        cameraQualityPresets[cameraQuality],
        setErrorMessage
      );
      if (cancelled) {
        acquired?.getTracks().forEach((track) => track.stop());
        return;
      }
      if (!acquired) {
        setCameraEnabled(false);
        return;
      }

      previewStream = acquired;
      cameraStreamRef.current = acquired;
      setCameraPreviewStream(acquired);
    })();

    return () => {
      cancelled = true;
      previewStream?.getTracks().forEach((track) => track.stop());
      if (cameraStreamRef.current === previewStream) {
        cameraStreamRef.current = null;
      }
      setCameraPreviewStream((current) => (current === previewStream ? null : current));
    };
  }, [cameraEnabled, selectedCameraId, cameraQuality, state]);

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
    failingRef.current = false;
    abortStartupRef.current = false;
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

      const wantsSystemAudio = systemAudioEnabled;
      const screenMaxHeight = screenQualityPresets[screenQuality].maxHeight;
      let screenStream: MediaStream;
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia(
          createDisplayCaptureOptions(wantsSystemAudio, screenMaxHeight)
        );
      } catch (captureError) {
        if (!wantsSystemAudio) {
          throw captureError;
        }
        // Some platforms/OS versions reject a display capture that also asks for
        // audio. Retry video-only so recording still works without system audio.
        screenStream = await navigator.mediaDevices.getDisplayMedia(
          createDisplayCaptureOptions(false, screenMaxHeight)
        );
      }
      screenStreamRef.current = screenStream;

      // Move the loopback audio onto its own stream so the screen video track
      // stays audio-free (the editor treats screen.webm as a video-only track).
      let systemStream: MediaStream | null = null;
      const systemAudioTracks = screenStream.getAudioTracks();
      if (systemAudioTracks.length > 0) {
        systemStream = new MediaStream(systemAudioTracks);
        systemAudioTracks.forEach((track) => screenStream.removeTrack(track));
      }
      systemStreamRef.current = systemStream;
      if (wantsSystemAudio && !systemStream) {
        setSystemAudioEnabled(false);
      }

      const cameraStream = await getOptionalCameraStream(
        cameraEnabled,
        selectedCameraId,
        cameraQualityPresets[cameraQuality],
        setErrorMessage
      );
      cameraStreamRef.current = cameraStream;
      setCameraPreviewStream(cameraStream);
      const micStream = await getOptionalMicStream(micEnabled, selectedMicId, setErrorMessage);
      micStreamRef.current = micStream;

      if (!cameraStream) {
        setCameraEnabled(false);
      }

      if (!micStream) {
        setMicEnabled(false);
      }

      const screenMimeType = getSupportedMimeType(videoMimeCandidates);
      const cameraMimeType = cameraStream ? getSupportedMimeType(videoMimeCandidates) : null;
      const micMimeType = micStream ? getSupportedMimeType(audioMimeCandidates) : null;
      const systemMimeType = systemStream ? getSupportedMimeType(audioMimeCandidates) : null;

      const createdProject = await window.openVideoCraft.projects.create({
        name: `Floating Recording ${new Date().toLocaleString()}`,
        baseDirectory: folder
      });
      setProject(createdProject);
      projectRef.current = createdProject;
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
          },
          system: {
            enabled: Boolean(systemStream),
            mimeType: systemMimeType
          }
        }
      });

      setProject(startedProject);
      projectRef.current = startedProject;

      recordersRef.current = createRecorders({
        screenStream,
        cameraStream,
        micStream,
        systemStream,
        screenMimeType,
        cameraMimeType,
        micMimeType,
        systemMimeType,
        screenBitsPerSecond: screenQualityPresets[screenQuality].videoBitsPerSecond,
        onChunk: (track, blob) => queueChunkWrite(startedProject.id, track, blob),
        onError: (error) => void failRecording(toErrorMessage(error))
      });

      screenStream.getVideoTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          if (stateRef.current === "recording" || stateRef.current === "paused") {
            void stopRecording();
            return;
          }

          void failRecording("Screen sharing ended before recording could start.");
        });
      });

      // A camera/mic/system device unplugged mid-recording ends its track
      // silently — only the screen track was watched before. Warn without
      // failing the whole recording. Our own stopAllStreams uses track.stop(),
      // which does not fire "ended", so this only triggers on real device loss.
      const warnDeviceLost = (label: string) => () => {
        const current = stateRef.current;
        if (current === "recording" || current === "paused" || current === "countdown") {
          setErrorMessage(
            `${label} disconnected during recording. That track stopped capturing; the rest of the recording continues.`
          );
        }
      };
      cameraStream?.getVideoTracks().forEach((track) =>
        track.addEventListener("ended", warnDeviceLost("Camera"), { once: true })
      );
      micStream?.getAudioTracks().forEach((track) =>
        track.addEventListener("ended", warnDeviceLost("Microphone"), { once: true })
      );
      systemStream?.getAudioTracks().forEach((track) =>
        track.addEventListener("ended", warnDeviceLost("System audio"), { once: true })
      );

      setState("countdown");
      await runCountdown(setCountdown);

      // Global-stop during preparing/countdown flags an abort here — before any
      // recorder starts — so the pending project is discarded rather than left
      // recording. Discarding also releases the main-process window-close wait.
      if (abortStartupRef.current) {
        await discardStartup();
        return;
      }

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
      await failRecording(toErrorMessage(error));
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
      setElapsedMs(preparedProject.durationMs ?? durationMs);
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

  async function discardStartup() {
    // Teardown for a startup aborted during preparing/countdown: stop the
    // acquired streams and discard the just-created project so it never lingers
    // in status "recording". Discarding also lets the main process complete any
    // window close it was waiting on.
    stoppingRef.current = true;
    stopAllStreams();

    const currentProject = projectRef.current;
    if (currentProject) {
      await window.openVideoCraft.projects.discard(currentProject.id).catch(() => undefined);
    }

    projectRef.current = null;
    setProject(null);
    activeRecordedMsRef.current = 0;
    activeSegmentStartedAtRef.current = null;
    setElapsedMs(0);
    abortStartupRef.current = false;
    stoppingRef.current = false;
    setState("ready");
  }

  async function failRecording(message: string) {
    if (failingRef.current) {
      return;
    }
    failingRef.current = true;
    stoppingRef.current = true;
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
    const write = previous.then(async () => {
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
    // Attach a rejection handler immediately. Waiting until Stop left an
    // unhandled rejection and made the recorder look healthy after disk/IPC
    // failures had already stopped a track from being written.
    void write.catch((error) => {
      if (stoppingRef.current || failingRef.current) {
        return;
      }
      void failRecording(`Could not save ${track} recording data: ${toErrorMessage(error)}`);
    });
    writeQueuesRef.current[track] = write;
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
      micStreamRef.current,
      systemStreamRef.current
    ]) {
      stream?.getTracks().forEach((track) => track.stop());
    }

    screenStreamRef.current = null;
    cameraStreamRef.current = null;
    micStreamRef.current = null;
    systemStreamRef.current = null;
    setCameraPreviewStream(null);
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
      systemAudioEnabled={systemAudioEnabled}
      selectedSourceName={selectedSource?.name ?? null}
      baseDirectory={baseDirectory}
      microphones={microphones}
      cameras={cameras}
      selectedMicId={selectedMicId}
      selectedCameraId={selectedCameraId}
      selectedCameraLabel={selectedCameraLabel}
      micEnabled={micEnabled}
      cameraEnabled={cameraEnabled}
      cameraPreviewStream={cameraPreviewStream}
      screenQuality={screenQuality}
      cameraQuality={cameraQuality}
      canStart={canStart}
      onSetCompactMode={(nextCompact) => void setCompactMode(nextCompact)}
      onMinimizeWindow={() => void window.openVideoCraft.windows.minimizeCurrent()}
      onDismissError={() => setErrorMessage(null)}
      onToggleBorderOverlay={() => setBorderOverlayEnabled((value) => !value)}
      onToggleSystemAudio={() => setSystemAudioEnabled((value) => !value)}
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
      onScreenQualityChange={setScreenQuality}
      onCameraQualityChange={setCameraQuality}
    />
  );
}
