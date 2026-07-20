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
  MonitorUp,
  Pause,
  Play,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X
} from "lucide-react";
import { useEffect, useRef } from "react";
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
import { truncateLabel } from "./recorder-utils";
import type { DeviceOption, FloatingState } from "./types";

export function RecorderControllerView(props: {
  compact: boolean;
  state: FloatingState;
  countdown: number;
  elapsedMs: number;
  errorMessage: string | null;
  projectRootPath: string | null;
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
  const systemAudioLabel = props.systemAudioEnabled
    ? "System audio on"
    : "System audio off";

  return (
    <main className="grid size-full place-items-center bg-transparent">
      <section className="flex h-full w-full flex-col overflow-hidden rounded-2xl bg-[#0b0b0d] pb-3 text-white shadow-[0_24px_80px_rgb(0_0_0_/_0.55)]" data-recorder-controller>
        <div className="flex h-14 flex-none items-center justify-between px-4 [-webkit-app-region:drag]">
          <div className="inline-flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-xl bg-[#ff3b9d]/10">
              <Video className="text-[#ff6db7]" size={17} fill="currentColor" />
            </span>
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

        <div className="mx-3 grid grid-cols-2 gap-2 rounded-2xl bg-white/[0.025] p-2">
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

          <FloatingDeviceControl
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
      className="aspect-video w-[200px] flex-none rounded-2xl bg-black object-cover shadow-[0_14px_34px_rgb(0_0_0_/_0.4)]"
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
    <label className="grid gap-1 rounded-xl bg-white/[0.035] px-3 py-2 text-[0.58rem] font-bold uppercase tracking-[0.12em] text-neutral-500 transition-colors hover:bg-white/[0.055] [-webkit-app-region:no-drag]">
      <span>{props.label}</span>
      <select
        className="themed-select w-full cursor-pointer border-0 bg-transparent py-1 text-xs font-bold normal-case tracking-normal text-white outline-none disabled:cursor-not-allowed disabled:opacity-45"
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

function RecorderBody(props: Parameters<typeof RecorderControllerView>[0]) {
  const isRecordingActive = props.state === "recording" || props.state === "paused";
  const isBusy = ["preparing", "countdown", "processing", "stopping"].includes(props.state);
  const showCameraPreview = props.cameraPreviewStream !== null;
  const sourceName = props.selectedSourceName ?? "No screen available";

  const statusText = props.state === "recording"
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
                : "Ready to record";

  return (
    <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden px-4 pb-5 pt-3">
      <div className="absolute left-1/2 top-3 inline-flex max-w-[88%] -translate-x-1/2 items-center gap-2 rounded-full bg-white/[0.045] px-3 py-1.5 text-[0.64rem] font-bold text-neutral-300">
        <MonitorUp className="shrink-0 text-[#ff6db7]" size={14} />
        <span className="truncate">{sourceName}</span>
      </div>

      <div className="recorder-state-enter flex flex-col items-center gap-4" key={props.state}>
        {showCameraPreview ? <CameraPreview stream={props.cameraPreviewStream!} /> : null}

        {isRecordingActive ? (
          <div className="grid min-w-[19rem] justify-items-center gap-4 rounded-3xl bg-white/[0.035] px-5 py-5 shadow-[0_18px_48px_rgb(0_0_0_/_0.28)]">
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
        ) : (
          <div className="grid justify-items-center gap-4">
            <div className={cx("relative grid size-28 place-items-center", !isBusy && "recorder-ready-glow")}>
              <button
                className="relative z-[1] grid size-[88px] place-items-center rounded-full border-0 bg-[#ff3b9d] text-white shadow-[0_16px_42px_rgb(255_59_157_/_0.28)] transition-[transform,background-color,box-shadow] duration-300 ease-out hover:scale-[1.04] hover:bg-[#ff58aa] hover:shadow-[0_18px_48px_rgb(255_59_157_/_0.38)] active:scale-[0.97] disabled:cursor-wait disabled:opacity-70 disabled:hover:scale-100"
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
                ) : (
                  <Video size={28} fill="currentColor" strokeWidth={1.8} />
                )}
              </button>
            </div>
            <div className="grid justify-items-center gap-1 text-center">
              <strong className="text-sm font-extrabold text-white">{statusText}</strong>
              <span className="max-w-[20rem] truncate text-[0.65rem] font-semibold text-neutral-500">
                {props.state === "complete" && props.projectRootPath
                  ? props.projectRootPath
                  : "Screen, camera, microphone, and system audio are saved as separate tracks."}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
