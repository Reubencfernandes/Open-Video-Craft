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
import { truncateLabel } from "./recorder-utils";
import type { DeviceOption, FloatingState } from "./types";

export function RecorderControllerView(props: {
  compact: boolean;
  state: FloatingState;
  countdown: number;
  elapsedMs: number;
  errorMessage: string | null;
  systemAudioEnabled: boolean;
  sources: SourceSummary[];
  selectedSourceId: string | null;
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
  onSourceChange: (sourceId: string) => void;
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
  const dockCameraRecordingControls =
    isRecordingActive && props.cameraPreviewStream !== null;
  const systemAudioLabel = props.systemAudioEnabled
    ? "System audio on"
    : "System audio off";

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
          </>
        )}
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
      className="pointer-events-none absolute inset-0 size-full bg-black object-cover"
      autoPlay
      muted
      playsInline
      aria-label="Camera preview"
    />
  );
}

function CaptureSourceSelect(props: {
  sources: SourceSummary[];
  selectedSourceId: string | null;
  disabled: boolean;
  onChange: (sourceId: string) => void;
}) {
  const screens = props.sources.filter((source) => source.kind === "screen");
  const windows = props.sources.filter((source) => source.kind === "window");

  return (
    <label className="absolute left-1/2 top-3 z-20 inline-flex max-w-[88%] -translate-x-1/2 items-center gap-2 rounded-xl bg-black/65 p-1.5 pl-3 text-[0.64rem] font-bold text-neutral-300 backdrop-blur-md [-webkit-app-region:no-drag]">
      <MonitorUp className="shrink-0 text-[#ff6db7]" size={14} />
      <span className="sr-only">Screen or window to record</span>
      <select
        className="themed-select h-8 min-w-0 max-w-[18rem] cursor-pointer border-0 bg-transparent text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-55"
        value={props.selectedSourceId ?? ""}
        disabled={props.disabled || props.sources.length === 0}
        onChange={(event) => props.onChange(event.target.value)}
        aria-label="Screen or window to record"
      >
        {props.sources.length === 0 ? <option value="">No source available</option> : null}
        {screens.length > 0 ? (
          <optgroup label="Screens">
            {screens.map((source) => (
              <option key={source.id} value={source.id}>{source.name}</option>
            ))}
          </optgroup>
        ) : null}
        {windows.length > 0 ? (
          <optgroup label="Windows">
            {windows.map((source) => (
              <option key={source.id} value={source.id}>{source.name}</option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </label>
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
  const showCameraPreview = props.cameraPreviewStream !== null;

  const statusText = getRecorderStatusText(props);

  return (
    <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden px-4 pb-5 pt-3">
      {showCameraPreview ? (
        <>
          <CameraPreview stream={props.cameraPreviewStream!} />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0_/_0.5)_0%,rgb(0_0_0_/_0.12)_42%,rgb(0_0_0_/_0.56)_100%)]" />
        </>
      ) : null}

      <CaptureSourceSelect
        sources={props.sources}
        selectedSourceId={props.selectedSourceId}
        disabled={!props.canStart}
        onChange={props.onSourceChange}
      />

      <div
        className={cx(
          "recorder-state-enter z-10 flex flex-col items-center gap-4",
          showCameraPreview && !isRecordingActive
            ? "absolute inset-x-0 bottom-4 px-4"
            : "relative"
        )}
        key={props.state}
      >
        {isRecordingActive ? (
          showCameraPreview ? null : <RecordingControls {...props} />
        ) : showCameraPreview ? (
          <button
            className="inline-flex h-12 items-center gap-3 rounded-full border border-white/15 bg-[#101012] py-1.5 pl-2 pr-5 text-white shadow-[0_12px_36px_rgb(0_0_0_/_0.42)] transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-[#18181b] active:translate-y-0 disabled:cursor-wait disabled:opacity-70"
            type="button"
            disabled={isBusy}
            onClick={props.onStartRecording}
            aria-label="Start recording"
            title="Start recording"
            data-recorder-start
          >
            <span className="grid size-9 place-items-center rounded-full border-2 border-white bg-red-600 shadow-[0_0_0_4px_rgb(0_0_0_/_0.2)]">
              {props.state === "countdown" ? (
                <strong className="text-base">{props.countdown}</strong>
              ) : isBusy ? (
                <LoaderCircle className="animate-spin" size={18} />
              ) : null}
            </span>
            <strong className="text-sm font-extrabold">{statusText}</strong>
          </button>
        ) : (
          <div className="grid justify-items-center gap-3">
            <div className="relative grid size-28 place-items-center">
              <button
                className="relative z-[1] grid size-[88px] place-items-center rounded-full border-2 border-white bg-red-600 text-white transition-colors duration-200 hover:bg-red-500 active:bg-red-700 disabled:cursor-wait disabled:opacity-70"
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
          </div>
        )}
      </div>
    </div>
  );
}
