/**
 * Floating recorder UI: expanded and compact layouts, record/pause/stop
 * controls, system-audio and border toggles, and device pickers.
 */
import {
  CheckCircle2,
  CircleStop,
  FolderOpen,
  LoaderCircle,
  Mic,
  MicOff,
  Minimize2,
  Pause,
  Play,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X
} from "lucide-react";
import { useEffect, useRef } from "react";
import { analyzeAudioSamples, smoothMeterLevel } from "./audio-meter";
import type { SourceSummary } from "../../shared/types";
import appLogo from "../assets/app.png";
import { cx } from "../classNames";
import { FloatingDeviceControl } from "./FloatingDeviceControl";
import { PixelTimer } from "./PixelTimer";
import {
  cameraQualities,
  cameraQualityPresets,
  screenQualities,
  screenQualityPresets,
  type CameraQuality,
  type ScreenQuality
} from "./quality";
import type { DeviceOption, FloatingState } from "./types";

export function RecorderControllerView(props: {
  compact: boolean;
  state: FloatingState;
  countdown: number;
  elapsedMs: number;
  errorMessage: string | null;
  systemAudioEnabled: boolean;
  sources: SourceSummary[];
  /** Real still preview per source id; falls back to the source thumbnail. */
  sourceThumbnails: Record<string, string>;
  selectedSourceIds: string[];
  baseDirectory: string | null;
  microphones: DeviceOption[];
  cameras: DeviceOption[];
  selectedMicId: string | null;
  selectedCameraIds: string[];
  micEnabled: boolean;
  cameraEnabled: boolean;
  /** Live preview per selected camera device id. */
  cameraPreviewStreams: Record<string, MediaStream>;
  screenQuality: ScreenQuality;
  cameraQuality: CameraQuality;
  canStart: boolean;
  onSetCompactMode: (compact: boolean) => void;
  onMinimizeWindow: () => void;
  onDismissError: () => void;
  onToggleSystemAudio: () => void;
  onClose: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  onChooseFolder: () => void;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onMicChange: (deviceId: string | null) => void;
  onToggleSource: (sourceId: string) => void;
  onToggleCameraDevice: (deviceId: string) => void;
  onScreenQualityChange: (quality: ScreenQuality) => void;
  onCameraQualityChange: (quality: CameraQuality) => void;
  microphoneLevel?: number;
  onResizeWindow?: (width: number, height: number) => void;
}) {
  if (props.compact) {
    return <CompactRecorderView {...props} />;
  }

  return <ExpandedRecorderView {...props} />;
}

function CompactRecorderView(props: Parameters<typeof RecorderControllerView>[0]) {
  const isRecordingActive = props.state === "recording" || props.state === "paused";

  return (
    <main className="grid size-full place-items-center bg-transparent">
      <div className="inline-flex h-full w-full items-center justify-between gap-3 rounded-full bg-[#0b0b0d]/95 py-0 pl-4 pr-2 font-bold text-white shadow-[0_18px_50px_rgb(0_0_0_/_0.48)] backdrop-blur-xl [-webkit-app-region:drag]">
        <button
          className="inline-flex min-w-0 flex-1 items-center gap-3 border-0 bg-transparent font-bold text-white [-webkit-app-region:no-drag]"
          type="button"
          onClick={() => props.onSetCompactMode(false)}
          aria-label="Restore recorder"
          title={isRecordingActive ? undefined : "Restore recorder"}
        >
          <span
            className={cx(
              "size-3.5 flex-none rounded-full bg-neutral-500 transition-colors duration-300",
              (props.state === "recording" || props.state === "paused") &&
                "recorder-recording-dot bg-[#ff3b9d] shadow-[0_0_0_4px_rgb(255_59_157_/_0.16)]"
            )}
          />
          <span className="truncate">
            {props.state === "paused"
              ? "Paused"
              : props.state === "recording"
                ? "Recording"
                : "Ready"}
          </span>
        </button>

        {isRecordingActive ? (
          <div className="inline-flex flex-none items-center gap-1.5 [-webkit-app-region:no-drag]">
            <button
              className="grid size-9 place-items-center rounded-full border-0 bg-white/[0.08] text-white transition-[transform,background-color] duration-200 hover:scale-105 hover:bg-white/[0.14] active:scale-95"
              type="button"
              onClick={
                props.state === "paused" ? props.onResumeRecording : props.onPauseRecording
              }
              aria-label={props.state === "paused" ? "Resume recording" : "Pause recording"}
            >
              {props.state === "paused" ? <Play size={17} /> : <Pause size={17} />}
            </button>
            <button
              className="grid size-9 place-items-center rounded-full border-0 bg-[#ff3b9d] text-white transition-[transform,background-color] duration-200 hover:scale-105 hover:bg-[#ff58aa] active:scale-95"
              type="button"
              onClick={props.onStopRecording}
              aria-label="Stop recording"
            >
              <CircleStop size={18} />
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function ExpandedRecorderView(props: Parameters<typeof RecorderControllerView>[0]) {
  const isRecordingActive = props.state === "recording" || props.state === "paused";
  const hasCameraStreams = Object.keys(props.cameraPreviewStreams).length > 0;
  const dockCameraRecordingControls = isRecordingActive && hasCameraStreams;
  const systemAudioLabel = props.systemAudioEnabled
    ? "System audio on"
    : "System audio off";
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  function beginResize(event: React.PointerEvent<HTMLDivElement>) {
    if (!props.onResizeWindow) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      width: window.innerWidth,
      height: window.innerHeight
    };
  }

  function moveResize(event: React.PointerEvent<HTMLDivElement>) {
    const start = resizeStartRef.current;
    if (!start || !props.onResizeWindow) return;
    const maxWidth = Math.max(460, window.screen.availWidth - 16);
    const maxHeight = Math.max(460, window.screen.availHeight - 16);
    const width = Math.min(maxWidth, Math.max(460, start.width + event.clientX - start.x));
    const height = Math.min(maxHeight, Math.max(460, start.height + event.clientY - start.y));
    void props.onResizeWindow(Math.round(width), Math.round(height));
  }

  function endResize() {
    resizeStartRef.current = null;
  }

  return (
    <main className="grid size-full place-items-center bg-transparent">
      <section className="flex h-full w-full flex-col overflow-hidden rounded-2xl bg-[#0b0b0d] pb-3 text-white shadow-[0_24px_80px_rgb(0_0_0_/_0.55)]" data-recorder-controller>
        <div className="flex h-14 flex-none items-center justify-between px-4 [-webkit-app-region:drag]">
          <div className="inline-flex min-w-0 items-center gap-2.5">
            <img className="size-8 rounded-xl object-contain" src={appLogo} alt="" />
            <span className="grid min-w-0 leading-tight">
              <strong className="truncate text-[0.82rem] font-extrabold">Open Video Craft</strong>
              <small className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-neutral-500">Screen recorder</small>
            </span>
          </div>
          <div className="inline-flex items-center gap-1 [-webkit-app-region:no-drag]">
            <button
              className="grid size-8 place-items-center rounded-xl border-0 bg-transparent text-neutral-400 transition-[transform,background-color,color] duration-200 hover:scale-105 hover:bg-white/[0.07] hover:text-white"
              type="button"
              aria-label="Minimize"
              title={isRecordingActive ? undefined : "Minimize to dock/taskbar"}
              onClick={props.onMinimizeWindow}
            >
              <Minimize2 size={20} />
            </button>
            <button
              className="grid size-8 place-items-center rounded-xl border-0 bg-transparent text-neutral-400 transition-[transform,background-color,color] duration-200 hover:scale-105 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              aria-label="Close"
              title={isRecordingActive ? "Stop or cancel recording before closing" : "Close"}
              onClick={props.onClose}
              disabled={!props.canStart}
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {props.errorMessage ? (
          <div className="recorder-state-enter relative mx-4 rounded-xl bg-rose-500/[0.1] p-4 pr-12 text-rose-100">
            <button
              className="absolute right-3 top-3 grid size-8 place-items-center rounded-md border-0 bg-transparent text-white hover:bg-white/10"
              type="button"
              onClick={props.onDismissError}
              title="Dismiss"
            >
              <X size={24} />
            </button>
            <div className="mb-1 text-sm font-bold">Recording issue</div>
            <p className="m-0 text-sm font-semibold leading-5">{props.errorMessage}</p>
          </div>
        ) : null}

        <RecorderBody {...props} />

        {props.onResizeWindow ? (
          <div
            className="absolute bottom-0.5 right-0.5 z-40 size-6 cursor-nwse-resize rounded-tr-lg [-webkit-app-region:no-drag] [background:repeating-linear-gradient(135deg,transparent_0,transparent_4px,rgba(255,255,255,0.5)_4px,rgba(255,255,255,0.5)_6px)]"
            data-recorder-resize-grip
            aria-label="Resize recorder"
            title="Drag to resize"
            onPointerDown={beginResize}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
          />
        ) : null}

        {dockCameraRecordingControls ? (
          <div className="flex-none px-3 pt-2">
            <RecordingControls {...props} docked />
          </div>
        ) : (
          <>
            <div className="mx-3 grid grid-cols-2 gap-2">
              <QualitySelect
                label="Screen quality"
                value={props.screenQuality}
                options={screenQualities.map((quality) => ({
                  value: quality,
                  label: screenQualityPresets[quality].label
                }))}
                disabled={!props.canStart}
                onChange={props.onScreenQualityChange}
              />
              <QualitySelect
                label="Camera quality"
                value={props.cameraQuality}
                options={cameraQualities.map((quality) => ({
                  value: quality,
                  label: cameraQualityPresets[quality].label
                }))}
                disabled={!props.canStart}
                onChange={props.onCameraQualityChange}
              />
            </div>

            <footer className="grid grid-cols-4 gap-2 px-3 pt-2">
              <FloatingDeviceControl
                enabled={props.micEnabled}
                enabledIcon={<Mic size={25} />}
                disabledIcon={<MicOff size={25} />}
                enabledLabel="Mic on"
                disabledLabel="Mic off"
                options={props.microphones}
                value={props.selectedMicId}
                disabled={!props.canStart}
                onToggle={props.onToggleMic}
                onValueChange={props.onMicChange}
              />
              <button
                className={cx(
                  "grid min-h-16 place-items-center gap-1 rounded-xl border-0 bg-white/[0.045] px-2 text-center text-[0.68rem] font-extrabold text-neutral-300 transition-[transform,background-color,color] duration-200 hover:-translate-y-0.5 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45",
                  props.systemAudioEnabled && "bg-[#ff3b9d]/10 text-white"
                )}
                type="button"
                onClick={props.onToggleSystemAudio}
                disabled={!props.canStart}
                aria-pressed={props.systemAudioEnabled}
                title={systemAudioLabel}
              >
                <span className={props.systemAudioEnabled ? "text-[#ff6db7]" : "text-neutral-500"}>
                  {props.systemAudioEnabled ? <Volume2 size={25} /> : <VolumeX size={25} />}
                </span>
                <span>{props.systemAudioEnabled ? "System on" : "System off"}</span>
              </button>

              <button
                className="grid min-h-16 place-items-center gap-1 rounded-xl border-0 bg-white/[0.045] px-2 text-center text-[0.68rem] font-extrabold text-neutral-300 transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45"
                type="button"
                onClick={props.onChooseFolder}
                disabled={!props.canStart}
                title={props.baseDirectory ?? "Choose project folder"}
              >
                <FolderOpen className="text-[#ff6db7]" size={25} />
                <span>{props.baseDirectory ? "Project set" : "Project"}</span>
              </button>

              <button
                className={cx(
                  "grid min-h-16 place-items-center gap-1 rounded-xl border-0 bg-white/[0.045] px-2 text-center text-[0.68rem] font-extrabold text-neutral-300 transition-[transform,background-color,color] duration-200 hover:-translate-y-0.5 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45",
                  props.cameraEnabled && "bg-[#ff3b9d]/10 text-white"
                )}
                type="button"
                onClick={props.onToggleCamera}
                disabled={!props.canStart || props.cameras.length === 0}
                aria-pressed={props.cameraEnabled}
                data-camera-toggle
                title={
                  props.cameraEnabled
                    ? `Recording ${props.selectedCameraIds.length} camera(s)`
                    : "Camera off"
                }
              >
                <span className={props.cameraEnabled ? "text-[#ff6db7]" : "text-neutral-500"}>
                  {props.cameraEnabled ? <Video size={25} /> : <VideoOff size={25} />}
                </span>
                <span>
                  {props.cameraEnabled && props.selectedCameraIds.length > 0
                    ? `${props.selectedCameraIds.length} cam`
                    : "Camera off"}
                </span>
              </button>
            </footer>

            <CameraMultiSelect
              cameras={props.cameras}
              selectedCameraIds={props.selectedCameraIds}
              previewStreams={props.cameraPreviewStreams}
              disabled={!props.canStart}
              onToggleDevice={props.onToggleCameraDevice}
            />
          </>
        )}
      </section>
    </main>
  );
}

function MicrophoneMeter(props: { level: number; enabled: boolean }) {
  const percent = Math.max(0, Math.min(100, Math.round(props.level)));
  return (
    <div
      className="pointer-events-none absolute bottom-3 right-3 z-10 w-28 rounded-lg border border-white/10 bg-black/55 p-2 backdrop-blur-md"
      data-microphone-meter={percent}
      aria-label="Microphone level"
    >
      <div className="mb-1 flex items-center justify-between text-[0.58rem] font-bold uppercase tracking-wide text-neutral-400">
        <span>Mic</span>
        <span>{props.enabled ? `${percent}%` : "off"}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={props.enabled && percent > 0 ? "h-full bg-emerald-400" : "h-full bg-neutral-600"}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

// Shared card surface so screens, windows and webcams read as the same kind
// of large source tile instead of three different controls.
function sourceCardClassName(selected: boolean): string {
  return cx(
    "grid min-w-0 gap-1 rounded-lg border-2 p-1 text-left transition-[border-color,background-color] duration-200 disabled:cursor-not-allowed disabled:opacity-55",
    selected
      ? "border-[#ff3b9d] bg-[#ff3b9d]/15"
      : "border-white/10 bg-white/[0.04] hover:border-white/25"
  );
}

function SourceGridCard(props: {
  source: SourceSummary;
  thumbnail: string;
  selected: boolean;
  disabled: boolean;
  onToggle: (sourceId: string) => void;
}) {
  return (
    <button
      type="button"
      data-source-card={props.source.id}
      aria-pressed={props.selected}
      aria-label={`Select ${props.source.name}`}
      title={props.source.name}
      disabled={props.disabled}
      onClick={() => props.onToggle(props.source.id)}
      className={sourceCardClassName(props.selected)}
    >
      <img
        className="aspect-video w-full rounded object-cover"
        src={props.thumbnail}
        alt=""
      />
      <span className="truncate text-[0.58rem] font-bold text-neutral-200">
        {props.source.name}
      </span>
    </button>
  );
}

function SourceGrid(props: {
  sources: SourceSummary[];
  thumbnails: Record<string, string>;
  selectedSourceIds: string[];
  disabled: boolean;
  onToggle: (sourceId: string) => void;
}) {
  const screens = props.sources.filter((source) => source.kind === "screen");
  const windows = props.sources.filter((source) => source.kind === "window");

  const renderGroup = (label: string, group: SourceSummary[]) =>
    group.length === 0 ? null : (
      <div className="grid gap-1" key={label}>
        <span className="text-[0.52rem] font-extrabold uppercase tracking-[0.14em] text-neutral-500">
          {label}
        </span>
        <div className="grid grid-cols-3 gap-1.5">
          {group.map((source) => (
            <SourceGridCard
              key={source.id}
              source={source}
              thumbnail={props.thumbnails[source.id] ?? source.thumbnail}
              selected={props.selectedSourceIds.includes(source.id)}
              disabled={props.disabled}
              onToggle={props.onToggle}
            />
          ))}
        </div>
      </div>
    );

  return (
    <div
      className="grid min-h-0 gap-2 overflow-y-auto rounded-xl bg-black/70 p-2 backdrop-blur-md [-webkit-app-region:no-drag]"
      aria-label="Screens and windows to record"
      role="group"
      data-source-grid
    >
      {props.sources.length === 0 ? (
        <span className="text-[0.6rem] font-bold text-neutral-400">No source available</span>
      ) : null}
      {renderGroup("Screens", screens)}
      {renderGroup("Windows", windows)}
    </div>
  );
}

function CameraCardVideo(props: { label: string; stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return undefined;
    }

    video.srcObject = props.stream;
    void video.play().catch(() => undefined);

    return () => {
      video.srcObject = null;
    };
  }, [props.stream]);

  return (
    <video
      ref={videoRef}
      className="aspect-video w-full rounded object-cover"
      autoPlay
      muted
      playsInline
      aria-label={`Camera ${props.label} preview`}
    />
  );
}

function CameraSourceCard(props: {
  camera: DeviceOption;
  stream: MediaStream | undefined;
  selected: boolean;
  disabled: boolean;
  onToggle: (deviceId: string) => void;
}) {
  return (
    <button
      type="button"
      data-camera-card={props.camera.deviceId}
      aria-pressed={props.selected}
      aria-label={`Record camera ${props.camera.label}`}
      title={props.camera.label}
      disabled={props.disabled}
      onClick={() => props.onToggle(props.camera.deviceId)}
      className={sourceCardClassName(props.selected)}
    >
      {props.stream ? (
        <CameraCardVideo label={props.camera.label} stream={props.stream} />
      ) : (
        <span className="grid aspect-video w-full place-items-center rounded bg-black/40 text-neutral-600">
          <VideoOff size={20} />
        </span>
      )}
      <span className="truncate text-[0.58rem] font-bold text-neutral-200">
        {props.camera.label}
      </span>
    </button>
  );
}

function CameraMultiSelect(props: {
  cameras: DeviceOption[];
  selectedCameraIds: string[];
  previewStreams: Record<string, MediaStream>;
  disabled: boolean;
  onToggleDevice: (deviceId: string) => void;
}) {
  if (props.cameras.length === 0) {
    return null;
  }

  return (
    <div
      className="mx-3 mt-2 grid max-h-56 flex-none gap-1 overflow-y-auto rounded-xl bg-white/[0.035] px-3 py-2 [-webkit-app-region:no-drag]"
      aria-label="Cameras to record"
      role="group"
      data-camera-picker
    >
      <span className="text-[0.52rem] font-extrabold uppercase tracking-[0.14em] text-neutral-500">
        Cameras
      </span>
      <div className="grid grid-cols-2 gap-1.5">
        {props.cameras.map((camera) => (
          <CameraSourceCard
            key={camera.deviceId}
            camera={camera}
            stream={props.previewStreams[camera.deviceId]}
            selected={props.selectedCameraIds.includes(camera.deviceId)}
            disabled={props.disabled}
            onToggle={props.onToggleDevice}
          />
        ))}
      </div>
    </div>
  );
}

// Compact labeled dropdown used for the screen/camera capture-quality pickers.
function QualitySelect<T extends string>(props: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <label className="grid gap-1.5 rounded-xl bg-white/[0.035] px-4 py-3 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-neutral-400 transition-colors hover:bg-white/[0.055] [-webkit-app-region:no-drag]">
      <span>{props.label}</span>
      <select
        className="themed-select h-9 w-full cursor-pointer border-0 bg-transparent px-2 text-sm font-bold normal-case tracking-normal text-white outline-none disabled:cursor-not-allowed disabled:opacity-45"
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value as T)}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[#171719] text-white">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatElapsedTime(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getRecorderStatusText(
  props: Parameters<typeof RecorderControllerView>[0]
): string {
  return props.state === "recording"
    ? "Recording in progress"
    : props.state === "paused"
      ? "Recording paused"
      : props.state === "countdown"
        ? `Starting in ${props.countdown}`
        : props.state === "processing"
          ? "Preparing your project"
          : props.state === "stopping"
            ? "Finishing recording"
            : props.state === "preparing"
              ? "Preparing capture"
              : props.state === "complete"
                ? "Recording saved"
                : "Start recording";
}

function RecordingControls(
  props: Parameters<typeof RecorderControllerView>[0] & { docked?: boolean }
) {
  const statusText = getRecorderStatusText(props);

  return (
    <div
      className={cx(
        "grid justify-items-center gap-4 px-5 py-5 shadow-[0_18px_48px_rgb(0_0_0_/_0.28)]",
        props.docked
          ? "w-full rounded-2xl bg-[#101012] ring-1 ring-white/10"
          : "min-w-[19rem] rounded-3xl bg-white/[0.035]"
      )}
    >
      <div className="inline-flex items-center gap-2 text-[0.64rem] font-extrabold uppercase tracking-[0.14em] text-neutral-300">
        <span
          className={cx(
            "size-2.5 rounded-full transition-colors",
            props.state === "paused"
              ? "bg-neutral-500"
              : "recorder-recording-dot bg-[#ff3b9d]"
          )}
        />
        {statusText}
      </div>
      <PixelTimer value={formatElapsedTime(props.elapsedMs)} />
      <div className="grid w-full grid-cols-3 gap-2">
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border-0 bg-white/[0.07] px-3 text-xs font-bold text-neutral-200 transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-white/[0.12] active:translate-y-0"
          type="button"
          onClick={props.state === "paused" ? props.onResumeRecording : props.onPauseRecording}
          aria-label={props.state === "paused" ? "Resume recording" : "Pause recording"}
        >
          {props.state === "paused" ? <Play size={16} /> : <Pause size={16} />}
          <span>{props.state === "paused" ? "Resume" : "Pause"}</span>
        </button>
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border-0 bg-white/[0.07] px-3 text-xs font-bold text-neutral-300 transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-white/[0.12] active:translate-y-0"
          type="button"
          onClick={props.onCancelRecording}
          aria-label="Cancel recording"
        >
          <X size={16} />
          <span>Cancel</span>
        </button>
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border-0 bg-[#ff3b9d] px-3 text-xs font-bold text-white shadow-[0_8px_22px_rgb(255_59_157_/_0.22)] transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-[#ff58aa] active:translate-y-0"
          type="button"
          onClick={props.onStopRecording}
          aria-label="Finish recording"
        >
          <CheckCircle2 size={16} />
          <span>Done</span>
        </button>
      </div>
    </div>
  );
}

function RecorderBody(props: Parameters<typeof RecorderControllerView>[0]) {
  const isRecordingActive = props.state === "recording" || props.state === "paused";
  const isBusy = ["preparing", "countdown", "processing", "stopping"].includes(props.state);

  const statusText = getRecorderStatusText(props);

  return (
    <div className="relative grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-3 overflow-hidden px-4 pb-3 pt-3">
      <SourceGrid
        sources={props.sources}
        thumbnails={props.sourceThumbnails}
        selectedSourceIds={props.selectedSourceIds}
        disabled={!props.canStart}
        onToggle={props.onToggleSource}
      />

      <MicrophoneMeter level={props.microphoneLevel ?? 0} enabled={props.micEnabled} />

      <div
        className="recorder-state-enter z-30 grid flex-none justify-items-center gap-3"
        key={props.state}
      >
        {isRecordingActive ? (
          <RecordingControls {...props} />
        ) : (
          <>
            <div className="relative grid size-32 place-items-center">
              <button
                className="relative z-[30] grid size-[104px] place-items-center rounded-full border-2 border-white bg-red-600 text-white shadow-[0_0_0_8px_rgb(220_38_38_/_0.18)] transition-colors duration-200 hover:bg-red-500 active:bg-red-700 disabled:cursor-wait disabled:opacity-70"
                type="button"
                disabled={isBusy}
                onClick={props.onStartRecording}
                aria-label="Start recording"
                title="Start recording"
                data-recorder-start
              >
                {props.state === "countdown" ? (
                  <strong className="text-3xl">{props.countdown}</strong>
                ) : isBusy ? (
                  <LoaderCircle className="animate-spin" size={26} />
                ) : null}
              </button>
            </div>
            <div className="grid justify-items-center text-center">
              <strong className="text-sm font-extrabold text-white">{statusText}</strong>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
