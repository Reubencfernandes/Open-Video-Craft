/**
 * Floating recorder state machine: multi-source screen/camera selection,
 * device selection, capture streams (screens, cameras, mic, system audio),
 * one MediaRecorder per selected source with chunk writing over IPC,
 * pause/resume/stop/cancel, and the border-overlay lifecycle. Rendering is
 * delegated to recorder/RecorderControllerView.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MediaTrackKey,
  ProjectSource,
  ProjectView,
  SourceSummary
} from "../shared/types";
import {
  createDisplayCaptureOptions,
  recordingRuntime
} from "./recording-runtime";
import { analyzeAudioSamples, smoothMeterLevel } from "./recorder/audio-meter";
import { RecorderControllerView } from "./recorder/RecorderControllerView";
import {
  audioMimeCandidates,
  captureDisplayStreamsSequentially,
  createProjectDevices,
  createRecordingCaptures,
  createRecorders,
  getDeviceLabel,
  getOptionalCameraStream,
  getOptionalMicStream,
  getSupportedMimeType,
  reconcileCameraSelection,
  reconcileSourceSelection,
  runCountdown,
  stopRecorder,
  toErrorMessage,
  toggleCameraSelection,
  toggleSourceSelection,
  videoMimeCandidates
} from "./recorder/recorder-utils";
import {
  cameraQualityPresets,
  screenQualityPresets,
  type CameraQuality,
  type ScreenQuality
} from "./recorder/quality";
import {
  createDefaultRecorderSettings,
  reconcileRecorderSettings,
  type RecorderSettings
} from "../shared/recorder-settings";
import type {
  DeviceOption,
  FloatingState,
  RecorderMap,
  WriteQueues
} from "./recorder/types";

interface AcquiredCamera {
  deviceId: string;
  label: string;
  stream: MediaStream;
}

export function RecorderController() {
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [sourceThumbnails, setSourceThumbnails] = useState<Record<string, string>>({});
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [baseDirectory, setBaseDirectory] = useState<string | null>(null);
  const [microphones, setMicrophones] = useState<DeviceOption[]>([]);
  const [cameras, setCameras] = useState<DeviceOption[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string | null>(null);
  const [selectedCameraIds, setSelectedCameraIds] = useState<string[]>([]);
  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraPreviewStreams, setCameraPreviewStreams] = useState<Record<string, MediaStream>>(
    {}
  );
  const [screenQuality, setScreenQuality] = useState<ScreenQuality>("source");
  const [cameraQuality, setCameraQuality] = useState<CameraQuality>("1080p");
  const [state, setState] = useState<FloatingState>("ready");
  const [countdown, setCountdown] = useState(3);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectView | null>(null);
  const [compact, setCompact] = useState(false);
  const [systemAudioEnabled, setSystemAudioEnabled] = useState(false);
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  // undefined = still loading, null = genuine first run, object = saved.
  const [storedSettings, setStoredSettings] = useState<
    RecorderSettings | null | undefined
  >(undefined);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  const [settingsApplied, setSettingsApplied] = useState(false);

  const screenStreamsRef = useRef<MediaStream[]>([]);
  const cameraStreamsRef = useRef<MediaStream[]>([]);
  const cameraPreviewStreamsRef = useRef<MediaStream[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const systemStreamRef = useRef<MediaStream | null>(null);
  const recordersRef = useRef<RecorderMap>({});
  const writeQueuesRef = useRef<WriteQueues>({});
  const projectRef = useRef<ProjectView | null>(null);
  const stateRef = useRef<FloatingState>("ready");
  const activeRecordedMsRef = useRef(0);
  const activeSegmentStartedAtRef = useRef<number | null>(null);
  const lastProjectUiSyncAtRef = useRef(0);
  const meterContextRef = useRef<AudioContext | null>(null);
  const stoppingRef = useRef(false);
  const failingRef = useRef(false);
  const abortStartupRef = useRef(false);
  const settingsAppliedRef = useRef(false);
  const persistedSettingsRef = useRef<string | null>(null);

  const selectedSources = useMemo(
    () =>
      selectedSourceIds
        .map((sourceId) => sources.find((source) => source.id === sourceId))
        .filter((source): source is SourceSummary => Boolean(source)),
    [selectedSourceIds, sources]
  );
  const selectedCameraOptions = useMemo(
    () => cameras.filter((camera) => selectedCameraIds.includes(camera.deviceId)),
    [cameras, selectedCameraIds]
  );
  const canStart = state === "ready" || state === "complete" || state === "failed";

  // Everything the owner picked, persisted at app level (never per project).
  const recorderSettings = useMemo<RecorderSettings>(
    () => ({
      schemaVersion: 1,
      sourceIds: selectedSourceIds,
      cameraIds: selectedCameraIds,
      micId: selectedMicId,
      micEnabled,
      cameraEnabled,
      systemAudioEnabled,
      screenQuality,
      cameraQuality
    }),
    [
      selectedSourceIds,
      selectedCameraIds,
      selectedMicId,
      micEnabled,
      cameraEnabled,
      systemAudioEnabled,
      screenQuality,
      cameraQuality
    ]
  );

  const refreshSources = useCallback(async () => {
    const nextSources = await window.openVideoCraft.sources.list();
    setSources(nextSources);
    setSelectedSourceIds((current) => reconcileSourceSelection(nextSources, current));
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
    setSelectedCameraIds((current) => {
      const available = reconcileCameraSelection(nextCameras, current);
      return available.length > 0 ? available : nextCameras[0] ? [nextCameras[0].deviceId] : [];
    });
    setMicEnabled((enabled) => (nextMicrophones.length > 0 ? enabled : false));
    setCameraEnabled((enabled) => (nextCameras.length > 0 ? enabled : false));
  }, []);

  useEffect(() => {
    void refreshSources()
      .catch((error) => setErrorMessage(toErrorMessage(error)))
      .finally(() => setSourcesLoaded(true));
    void refreshDevices()
      .catch(() => undefined)
      .finally(() => setDevicesLoaded(true));
  }, [refreshDevices, refreshSources]);

  // App-level preferences: a genuine first run (no saved file) selects every
  // screen and webcam at maximum quality with the microphone on, while a saved
  // selection is reconciled against the devices that still exist. Never stored
  // per project, so every new recording starts from the owner's own setup.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let settings: RecorderSettings | null = null;
      try {
        settings = await window.openVideoCraft.recorder.getSettings();
      } catch {
        // An unreadable preferences file behaves like a first run.
        settings = null;
      }
      if (!cancelled) setStoredSettings(settings);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      settingsAppliedRef.current ||
      storedSettings === undefined ||
      !sourcesLoaded ||
      !devicesLoaded
    ) {
      return;
    }
    settingsAppliedRef.current = true;

    const available = { sources, cameras, microphones };
    const firstRun = storedSettings === null;
    const reconciled = reconcileRecorderSettings(
      firstRun ? createDefaultRecorderSettings(available) : storedSettings,
      available
    );
    // A first run never falls back to a window: only screens are preselected.
    const sourceIds = firstRun
      ? reconciled.sourceIds
      : reconcileSourceSelection(sources, reconciled.sourceIds);
    const cameraIds = reconcileCameraSelection(cameras, reconciled.cameraIds);
    const applied: RecorderSettings = {
      ...reconciled,
      sourceIds,
      cameraIds,
      micEnabled: reconciled.micEnabled && microphones.length > 0,
      cameraEnabled: reconciled.cameraEnabled && cameraIds.length > 0
    };

    setSelectedSourceIds(applied.sourceIds);
    setSelectedCameraIds(applied.cameraIds);
    setSelectedMicId(applied.micId);
    setMicEnabled(applied.micEnabled);
    setCameraEnabled(applied.cameraEnabled);
    setScreenQuality(applied.screenQuality);
    setCameraQuality(applied.cameraQuality);
    setSystemAudioEnabled(applied.systemAudioEnabled);

    persistedSettingsRef.current = JSON.stringify(applied);
    setSettingsApplied(true);
    if (firstRun) {
      // Persist the first-run defaults so they are a one-time initialization
      // instead of re-running on every launch.
      void window.openVideoCraft.recorder.saveSettings(applied).catch(() => undefined);
    }
  }, [
    storedSettings,
    sourcesLoaded,
    devicesLoaded,
    sources,
    cameras,
    microphones
  ]);

  // Remember every change to the source/camera/quality selection so the next
  // recording (and the next app launch) reuses it without touching a project.
  useEffect(() => {
    if (!settingsApplied || state !== "ready") {
      return;
    }
    const serialized = JSON.stringify(recorderSettings);
    if (persistedSettingsRef.current === serialized) {
      return;
    }
    persistedSettingsRef.current = serialized;
    void window.openVideoCraft.recorder
      .saveSettings(recorderSettings)
      .catch(() => undefined);
  }, [recorderSettings, settingsApplied, state]);

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

  // Multi-source preview grid: fetch a real still frame for every listed screen
  // and window (one main-process capture pass) and keep the previous frames
  // while the list refreshes.
  useEffect(() => {
    if (sources.length === 0) {
      return undefined;
    }

    let cancelled = false;
    void window.openVideoCraft.sources
      .thumbnails(sources.map((source) => source.id))
      .then((thumbnails) => {
        if (!cancelled) {
          setSourceThumbnails((current) => ({ ...current, ...thumbnails }));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [sources]);

  // Display-sized transparent overlay windows are deliberately not used here.
  // On some macOS/Windows compositor configurations they can be promoted to an
  // opaque surface and cover the selected display. Always close a stale overlay
  // when the controller mounts and when it leaves; the selected sources remain
  // clearly identified inside the recorder window instead.
  useEffect(() => {
    void window.openVideoCraft.overlays.hideSourceBorder();
    return () => {
      void window.openVideoCraft.overlays.hideSourceBorder();
    };
  }, []);

  useEffect(() => {
    if (state !== "recording") {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedMs(getCurrentRecordedDurationMs());
    }, recordingRuntime.elapsedUpdateMs);

    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => {
    const stream = micStreamRef.current;
    const audioTrack = stream?.getAudioTracks()[0];
    if (!micEnabled || audioTrack === undefined || audioTrack.readyState !== "live") {
      setMicrophoneLevel(0);
      return undefined;
    }

    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return undefined;
    const context = new AudioContextConstructor();
    meterContextRef.current = context;
    const source = context.createMediaStreamSource(new MediaStream([audioTrack]));
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let current = 0;
    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      current = smoothMeterLevel(current, analyzeAudioSamples(samples).percent);
      setMicrophoneLevel(current);
    }, 80);

    return () => {
      window.clearInterval(timer);
      source.disconnect();
      void context.close();
      if (meterContextRef.current === context) meterContextRef.current = null;
      setMicrophoneLevel(0);
    };
  }, [micEnabled, micStreamRef.current, state]);

  // Live camera previews while idle: whenever cameras are enabled and some
  // devices are chosen (and we are not mid-capture), open every selected camera
  // (bounded) so each webcam card shows a real feed before recording. During
  // capture the recording streams drive the cards instead, so this effect only
  // owns and releases the idle preview streams.
  const selectedCameraKey = selectedCameraIds.join(",");

  useEffect(() => {
    if (!cameraEnabled || selectedCameraKey.length === 0 || state !== "ready") {
      return undefined;
    }

    let cancelled = false;
    const acquired: Record<string, MediaStream> = {};

    void (async () => {
      for (const deviceId of selectedCameraKey.split(",").slice(0, 4)) {
        const stream = await getOptionalCameraStream(
          true,
          deviceId,
          cameraQualityPresets[cameraQuality],
          setErrorMessage
        );
        if (cancelled) {
          stream?.getTracks().forEach((track) => track.stop());
          continue;
        }
        if (stream) {
          acquired[deviceId] = stream;
        }
      }

      if (cancelled) {
        return;
      }

      const streams = Object.values(acquired);
      if (streams.length === 0) {
        setCameraEnabled(false);
        return;
      }

      cameraPreviewStreamsRef.current = streams;
      setCameraPreviewStreams(acquired);
    })();

    return () => {
      cancelled = true;
      Object.values(acquired).forEach((stream) =>
        stream.getTracks().forEach((track) => track.stop())
      );
      cameraPreviewStreamsRef.current = [];
      setCameraPreviewStreams({});
    };
  }, [cameraEnabled, selectedCameraKey, cameraQuality, state]);

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

  function toggleSource(sourceId: string) {
    setSelectedSourceIds((current) => toggleSourceSelection(current, sourceId));
  }

  function toggleCameraDevice(deviceId: string) {
    setSelectedCameraIds((current) => toggleCameraSelection(current, deviceId));
    setCameraEnabled(true);
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
    const recordingSources = selectedSources;

    if (recordingSources.length === 0) {
      setErrorMessage("Select at least one screen or window to record.");
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

      const screenMaxHeight = screenQualityPresets[screenQuality].maxHeight;
      const displayResult = await captureDisplayStreamsSequentially({
        sourceIds: recordingSources.map((source) => source.id),
        systemAudio: systemAudioEnabled,
        createOptions: (withSystemAudio) =>
          createDisplayCaptureOptions(withSystemAudio, screenMaxHeight),
        selectSource: (sourceId) =>
          window.openVideoCraft.capture.selectDisplaySource(sourceId),
        releaseSource: () => window.openVideoCraft.capture.releaseDisplaySource(),
        getDisplayMedia: (options) => navigator.mediaDevices.getDisplayMedia(options)
      });

      const screenStreams = displayResult.screens.map(
        ({ stream }) => new MediaStream(stream.getVideoTracks())
      );
      screenStreamsRef.current = screenStreams;

      // Move the loopback audio onto its own stream so the screen video tracks
      // stay audio-free (the editor treats screen.webm as a video-only track).
      // System audio is captured once, with the first display, and never mixed
      // with the microphone track.
      const systemStream = displayResult.systemAudioTracks.length > 0
        ? new MediaStream(displayResult.systemAudioTracks)
        : null;
      systemStreamRef.current = systemStream;
      if (systemAudioEnabled && !systemStream) {
        setSystemAudioEnabled(false);
      }

      const acquiredCameras: AcquiredCamera[] = [];
      if (cameraEnabled) {
        for (const camera of selectedCameraOptions) {
          const stream = await getOptionalCameraStream(
            true,
            camera.deviceId,
            cameraQualityPresets[cameraQuality],
            setErrorMessage
          );
          if (stream) {
            acquiredCameras.push({ deviceId: camera.deviceId, label: camera.label, stream });
          }
        }
      }
      cameraStreamsRef.current = acquiredCameras.map((camera) => camera.stream);
      setCameraPreviewStreams(
        Object.fromEntries(acquiredCameras.map((camera) => [camera.deviceId, camera.stream]))
      );
      if (acquiredCameras.length === 0) {
        setCameraEnabled(false);
      }

      const micStream = await getOptionalMicStream(micEnabled, selectedMicId, setErrorMessage);
      micStreamRef.current = micStream;
      if (!micStream) {
        setMicEnabled(false);
      }

      const screenMimeType = getSupportedMimeType(videoMimeCandidates);
      const cameraMimeType = acquiredCameras.length > 0
        ? getSupportedMimeType(videoMimeCandidates)
        : null;
      const micMimeType = micStream ? getSupportedMimeType(audioMimeCandidates) : null;
      const systemMimeType = systemStream ? getSupportedMimeType(audioMimeCandidates) : null;

      const createdProject = await window.openVideoCraft.projects.create({
        name: `Floating Recording ${new Date().toLocaleString()}`,
        baseDirectory: folder
      });
      setProject(createdProject);
      projectRef.current = createdProject;

      const sourcesForProject: ProjectSource[] = recordingSources.map((source) => ({
        id: source.id,
        name: source.name,
        kind: source.kind,
        displayId: source.displayId
      }));
      const [source] = sourcesForProject;
      const devices = createProjectDevices({
        microphones,
        cameras,
        micEnabled: Boolean(micStream),
        cameraEnabled: acquiredCameras.length > 0,
        selectedMicId,
        selectedCameraId: acquiredCameras[0]?.deviceId ?? selectedCameraIds[0] ?? null
      });
      const capturePlan = createRecordingCaptures({
        screens: displayResult.screens.map((screen, index) => ({
          sourceId: screen.sourceId,
          label: recordingSources[index]?.name ?? "Screen",
          mimeType: screenMimeType
        })),
        cameras: acquiredCameras.map((camera) => ({
          deviceId: camera.deviceId,
          label: camera.label,
          mimeType: cameraMimeType ?? screenMimeType
        })),
        mic: micStream && micMimeType
          ? {
              deviceId: selectedMicId ?? "",
              label: getDeviceLabel(microphones, selectedMicId, "Microphone"),
              mimeType: micMimeType
            }
          : null,
        system: systemStream && systemMimeType ? { mimeType: systemMimeType } : null
      });

      // Pair every planned track with the stream that feeds its recorder.
      const streamsByTrackId = new Map<string, MediaStream>();
      let screenIndex = 0;
      let cameraIndex = 0;
      for (const capture of capturePlan) {
        if (capture.kind === "screen") {
          const stream = screenStreams[screenIndex];
          screenIndex += 1;
          if (stream) streamsByTrackId.set(capture.trackId, stream);
        } else if (capture.kind === "camera") {
          const camera = acquiredCameras[cameraIndex];
          cameraIndex += 1;
          if (camera) streamsByTrackId.set(capture.trackId, camera.stream);
        } else if (capture.kind === "mic" && micStream) {
          streamsByTrackId.set(capture.trackId, micStream);
        } else if (capture.kind === "system" && systemStream) {
          streamsByTrackId.set(capture.trackId, systemStream);
        }
      }
      const captures = capturePlan.filter((capture) =>
        streamsByTrackId.has(capture.trackId)
      );

      const startedProject = await window.openVideoCraft.recording.start({
        projectId: createdProject.id,
        source,
        sources: sourcesForProject,
        devices,
        tracks: {
          screen: {
            enabled: true,
            mimeType: screenMimeType
          },
          camera: {
            enabled: acquiredCameras.length > 0,
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
        },
        captures
      });

      setProject(startedProject);
      projectRef.current = startedProject;

      recordersRef.current = createRecorders({
        captures: captures.map((capture) => ({
          trackId: capture.trackId,
          stream: streamsByTrackId.get(capture.trackId)!,
          mimeType: capture.mimeType,
          kind: capture.kind === "screen" || capture.kind === "camera" ? "video" : "audio",
          videoBitsPerSecond: capture.kind === "screen"
            ? screenQualityPresets[screenQuality].videoBitsPerSecond
            : undefined
        })),
        onChunk: (trackId, blob) => queueChunkWrite(startedProject.id, trackId, blob),
        onError: (error) => void failRecording(toErrorMessage(error))
      });

      for (const stream of screenStreams) {
        stream.getVideoTracks().forEach((track) => {
          track.addEventListener("ended", () => {
            if (stateRef.current === "recording" || stateRef.current === "paused") {
              void stopRecording();
              return;
            }

            void failRecording("Screen sharing ended before recording could start.");
          });
        });
      }

      // A camera/mic/system device unplugged mid-recording ends its track
      // silently — only the screen tracks end the recording. Warn without
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
      acquiredCameras.forEach((camera) =>
        camera.stream.getVideoTracks().forEach((track) =>
          track.addEventListener("ended", warnDeviceLost(`Camera "${camera.label}"`), {
            once: true
          })
        )
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
      await window.openVideoCraft.windows.openEditor(preparedProject.id, {
        autoAnalyze: true
      });
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
    // A failed startup must not leave a reserved display source behind.
    await window.openVideoCraft.capture.releaseDisplaySource().catch(() => undefined);
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

  function queueChunkWrite(projectId: string, trackId: MediaTrackKey, blob: Blob) {
    if (blob.size === 0) {
      return;
    }

    const previous = writeQueuesRef.current[trackId] ?? Promise.resolve();
    const write = previous.then(async () => {
      const chunk = await blob.arrayBuffer();
      const updatedProject = await window.openVideoCraft.recording.writeChunk({
        projectId,
        track: trackId,
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
      void failRecording(`Could not save ${trackId} recording data: ${toErrorMessage(error)}`);
    });
    writeQueuesRef.current[trackId] = write;
  }

  function stopAllStreams() {
    Object.values(recordersRef.current).forEach((recorder) => {
      if (recorder?.state === "recording" || recorder?.state === "paused") {
        recorder.stop();
      }
    });
    recordersRef.current = {};

    for (const stream of [
      ...screenStreamsRef.current,
      ...cameraStreamsRef.current,
      ...cameraPreviewStreamsRef.current,
      micStreamRef.current,
      systemStreamRef.current
    ]) {
      stream?.getTracks().forEach((track) => track.stop());
    }

    screenStreamsRef.current = [];
    cameraStreamsRef.current = [];
    cameraPreviewStreamsRef.current = [];
    micStreamRef.current = null;
    systemStreamRef.current = null;
    setCameraPreviewStreams({});
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
      systemAudioEnabled={systemAudioEnabled}
      sources={sources}
      sourceThumbnails={sourceThumbnails}
      selectedSourceIds={selectedSourceIds}
      baseDirectory={baseDirectory}
      microphones={microphones}
      cameras={cameras}
      selectedMicId={selectedMicId}
      selectedCameraIds={selectedCameraIds}
      micEnabled={micEnabled}
      cameraEnabled={cameraEnabled}
      cameraPreviewStreams={cameraPreviewStreams}
      screenQuality={screenQuality}
      cameraQuality={cameraQuality}
      canStart={canStart}
      onSetCompactMode={(nextCompact) => void setCompactMode(nextCompact)}
      onMinimizeWindow={() => void window.openVideoCraft.windows.minimizeCurrent()}
      onDismissError={() => setErrorMessage(null)}
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
      onToggleSource={toggleSource}
      onToggleCameraDevice={toggleCameraDevice}
      onScreenQualityChange={setScreenQuality}
      onCameraQualityChange={setCameraQuality}
      microphoneLevel={microphoneLevel}
      onResizeWindow={(width, height) =>
        void window.openVideoCraft.windows.setRecorderSize(width, height)
      }
    />
  );
}
