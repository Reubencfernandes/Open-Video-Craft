/**
 * Floating recorder UI: expanded and compact layouts, record/pause/stop
 * controls, system-audio and border toggles, and device pickers.
 */
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
  Volume2,
  VolumeX,
  X
} from "lucide-react";
import { useEffect, useRef } from "react";
import appLogo from "../assets/app.png";
import { cx } from "../classNames";
import { FloatingDeviceControl } from "./FloatingDeviceControl";
import {
  cameraQualities,
  cameraQualityPresets,
  screenQualities,
  screenQualityPresets,
  type CameraQuality,
  type ScreenQuality
} from "./quality";
import { truncateLabel } from "./recorder-utils";
import type { DeviceOption, FloatingState } from "./types";

export function RecorderControllerView(props: {
  compact: boolean;
  state: FloatingState;
  countdown: number;
  elapsedMs: number;
  errorMessage: string | null;
  projectRootPath: string | null;
  borderOverlayEnabled: boolean;
  systemAudioEnabled: boolean;
  selectedSourceName: string | null;
  baseDirectory: string | null;
  microphones: DeviceOption[];
  cameras: DeviceOption[];
  selectedMicId: string | null;
  selectedCameraId: string | null;
  selectedCameraLabel: string;
  micEnabled: boolean;
  cameraEnabled: boolean;
  cameraPreviewStream: MediaStream | null;
  screenQuality: ScreenQuality;
  cameraQuality: CameraQuality;
  canStart: boolean;
  onSetCompactMode: (compact: boolean) => void;
  onMinimizeWindow: () => void;
  onDismissError: () => void;
  onToggleBorderOverlay: () => void;
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
  onCameraChange: (deviceId: string | null) => void;
  onScreenQualityChange: (quality: ScreenQuality) => void;
  onCameraQualityChange: (quality: CameraQuality) => void;
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
      <div className="inline-flex h-full w-full items-center justify-between gap-3 rounded-full border border-white/15 bg-slate-950/95 py-0 pl-4 pr-2 font-bold text-white shadow-2xl [-webkit-app-region:drag]">
        <button
          className="inline-flex min-w-0 flex-1 items-center gap-3 border-0 bg-transparent font-bold text-white [-webkit-app-region:no-drag]"
          type="button"
          onClick={() => props.onSetCompactMode(false)}
          aria-label="Restore recorder"
          title={isRecordingActive ? undefined : "Restore recorder"}
        >
          <span
            className={cx(
              "size-3.5 flex-none rounded-full bg-cyan-500 shadow-[0_0_0_4px_rgb(6_182_212_/_0.14)]",
              (props.state === "recording" || props.state === "paused") &&
                "bg-red-500 shadow-[0_0_0_4px_rgb(248_60_72_/_0.18)]"
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
              className="grid size-9 place-items-center rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/15"
              type="button"
              onClick={
                props.state === "paused" ? props.onResumeRecording : props.onPauseRecording
              }
              aria-label={props.state === "paused" ? "Resume recording" : "Pause recording"}
            >
              {props.state === "paused" ? <Play size={17} /> : <Pause size={17} />}
            </button>
            <button
              className="grid size-9 place-items-center rounded-full border border-red-300/30 bg-red-600 text-white hover:bg-red-700"
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
  const borderOverlayLabel = props.borderOverlayEnabled
    ? "Hide screen border"
    : "Show screen border";
  const systemAudioLabel = props.systemAudioEnabled
    ? "System audio on"
    : "System audio off";

  return (
    <main className="grid size-full place-items-center bg-transparent">
      <section className="flex h-full w-full flex-col overflow-hidden rounded-[12px] bg-[#121317] pb-[20px] text-white">
        <div className="flex h-12 flex-none items-center justify-between border-b border-white/[0.07] px-4 [-webkit-app-region:drag]">
          <div className="inline-flex min-w-0 items-center gap-2.5 text-[0.82rem] font-extrabold">
            <img className="block size-7 object-contain" src={appLogo} alt="" />
            <span>Open Video Craft</span>
          </div>
          <div className="inline-flex items-center gap-1 [-webkit-app-region:no-drag]">
            <button
              className="grid size-8 place-items-center rounded-md border-0 bg-transparent text-slate-300 hover:bg-white/10 hover:text-white"
              type="button"
              aria-label={borderOverlayLabel}
              title={isRecordingActive ? undefined : borderOverlayLabel}
              onClick={props.onToggleBorderOverlay}
            >
              {props.borderOverlayEnabled ? <Eye size={19} /> : <EyeOff size={19} />}
            </button>
            <button
              className="grid size-8 place-items-center rounded-md border-0 bg-transparent text-slate-300 hover:bg-white/10 hover:text-white"
              type="button"
              aria-label="Minimize"
              title={isRecordingActive ? undefined : "Minimize to dock/taskbar"}
              onClick={props.onMinimizeWindow}
            >
              <Minimize2 size={20} />
            </button>
            <button
              className="grid size-8 place-items-center rounded-md border-0 bg-transparent text-slate-300 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
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
          <div className="relative m-4 rounded-lg border border-red-400/35 bg-red-950/70 p-4 pr-12 text-red-50">
            <button
              className="absolute right-3 top-3 grid size-8 place-items-center rounded-md border-0 bg-transparent text-white hover:bg-white/10"
              type="button"
              onClick={props.onDismissError}
              title="Dismiss"
            >
              <X size={24} />
            </button>
            <div className="mb-2 text-base font-bold">Error</div>
            <p className="m-0 text-sm font-semibold leading-5">{props.errorMessage}</p>
          </div>
        ) : null}

        <RecorderBody {...props} />

        <div className="grid grid-cols-2 gap-2 border-t border-white/[0.07] px-3 pt-3">
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

        <footer className="grid grid-cols-4 gap-2 border-t border-white/[0.07] p-3">
          <FloatingDeviceControl
            accent="mic"
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
              "grid min-h-16 place-items-center gap-1 rounded-lg border border-white/10 bg-white/[0.045] px-2 text-center text-[0.68rem] font-extrabold text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45",
              props.systemAudioEnabled && "border-sky-300/40 bg-sky-500/15 text-sky-100"
            )}
            type="button"
            onClick={props.onToggleSystemAudio}
            disabled={!props.canStart}
            aria-pressed={props.systemAudioEnabled}
            title={systemAudioLabel}
          >
            <span className={props.systemAudioEnabled ? "text-sky-300" : "text-amber-300"}>
              {props.systemAudioEnabled ? <Volume2 size={25} /> : <VolumeX size={25} />}
            </span>
            <span>{props.systemAudioEnabled ? "System on" : "System off"}</span>
          </button>

          <button
            className="grid min-h-16 place-items-center gap-1 rounded-lg border border-white/10 bg-white/[0.045] px-2 text-center text-[0.68rem] font-extrabold text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
            type="button"
            onClick={props.onChooseFolder}
            disabled={!props.canStart}
            title={props.baseDirectory ?? "Choose project folder"}
          >
            <FolderOpen className="text-violet-300" size={25} />
            <span>{props.baseDirectory ? "Project set" : "Project"}</span>
          </button>

          <FloatingDeviceControl
            accent="camera"
            enabled={props.cameraEnabled}
            enabledIcon={<Video size={25} />}
            disabledIcon={<VideoOff size={25} />}
            enabledLabel={truncateLabel(props.selectedCameraLabel)}
            disabledLabel="Camera off"
            options={props.cameras}
            value={props.selectedCameraId}
            disabled={!props.canStart}
            onToggle={props.onToggleCamera}
            onValueChange={props.onCameraChange}
          />
        </footer>
      </section>
    </main>
  );
}

function CameraPreview(props: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
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
      className="aspect-video w-[200px] flex-none rounded-xl border border-white/10 bg-black object-cover shadow-lg"
      autoPlay
      muted
      playsInline
    />
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
    <label className="grid gap-1 text-[0.6rem] font-bold uppercase tracking-wide text-slate-400 [-webkit-app-region:no-drag]">
      {props.label}
      <select
        className="w-full cursor-pointer rounded-md border border-white/10 bg-white/[0.05] px-2 py-1.5 text-xs font-bold text-white outline-none hover:bg-white/10 focus:border-white/25 disabled:cursor-not-allowed disabled:opacity-45"
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value as T)}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value} className="bg-slate-900 text-white">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function RecorderBody(props: Parameters<typeof RecorderControllerView>[0]) {
  const isRecordingActive = props.state === "recording" || props.state === "paused";
  const primaryActionLabel = isRecordingActive ? "Stop recording" : "Start recording";
  const showCameraPreview = props.cameraPreviewStream !== null;

  return (
    <div className="relative grid min-h-0 flex-1 place-items-center px-4 pb-6 pt-4">
      {props.state === "complete" ? (
        <div className="absolute top-4 grid justify-items-center gap-1 text-emerald-300">
          <CheckCircle2 size={28} />
          <span className="text-sm font-extrabold">Saved</span>
          <small
            className="max-w-[360px] break-all text-center text-xs leading-4 text-slate-400"
            title={props.projectRootPath ?? ""}
          >
            {props.projectRootPath ?? ""}
          </small>
        </div>
      ) : null}

      <div className="flex flex-col items-center gap-4">
        {showCameraPreview ? <CameraPreview stream={props.cameraPreviewStream!} /> : null}

        {isRecordingActive ? (
          <div className="grid justify-items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 shadow-lg">
            <div className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-rose-200">
              <span className={`size-2.5 rounded-full ${props.state === "paused" ? "bg-amber-300" : "animate-pulse bg-rose-500"}`} />
              {props.state === "paused" ? "Recording paused" : "Recording in progress"}
            </div>
            <div className="inline-flex items-center gap-2">
              <button
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-300/25 bg-amber-400/10 px-3 text-sm font-bold text-amber-100 hover:bg-amber-400/20"
                type="button"
                onClick={props.state === "paused" ? props.onResumeRecording : props.onPauseRecording}
                aria-label={props.state === "paused" ? "Resume recording" : "Pause recording"}
              >
                {props.state === "paused" ? <Play size={17} /> : <Pause size={17} />}
                <span>{props.state === "paused" ? "Resume" : "Pause"}</span>
              </button>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-300/25 bg-rose-500/10 px-3 text-sm font-bold text-rose-100 hover:bg-rose-500/20"
                type="button"
                onClick={props.onCancelRecording}
                aria-label="Cancel recording"
              >
                <X size={17} />
                <span>Cancel</span>
              </button>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-500/15 px-3 text-sm font-bold text-emerald-100 hover:bg-emerald-500/25"
                type="button"
                onClick={props.onStopRecording}
                aria-label="Finish recording"
              >
                <CheckCircle2 size={17} />
                <span>Done</span>
              </button>
            </div>
          </div>
        ) : (
          <button
            className="grid size-[76px] place-items-center rounded-full border-0 bg-rose-600 text-3xl font-extrabold text-white shadow-[0_0_0_8px_rgb(244_63_94_/_0.1)] transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-70"
            type="button"
            disabled={
              props.state === "preparing" ||
              props.state === "countdown" ||
              props.state === "processing" ||
              props.state === "stopping"
            }
            onClick={props.onStartRecording}
            aria-label={primaryActionLabel}
            title={primaryActionLabel}
          >
            {props.state === "countdown" ? props.countdown : null}
          </button>
        )}
      </div>

      <div className="absolute bottom-5 max-w-[86%] truncate text-center text-xs font-bold text-slate-400">
        {props.state === "recording"
          ? props.selectedSourceName
            ? `Recording screen: ${props.selectedSourceName}`
            : "Recording"
          : props.state === "paused"
            ? "Paused"
            : props.state === "countdown"
              ? "Starting"
              : props.state === "processing"
                ? "Processing audio"
                : props.state === "preparing"
                  ? "Preparing"
                  : props.selectedSourceName
                    ? `Recording screen: ${props.selectedSourceName}`
                    : "No screen found"}
      </div>
    </div>
  );
}
