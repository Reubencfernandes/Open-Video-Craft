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
import appLogo from "../assets/app.png";
import { cx } from "../classNames";
import { FloatingDeviceControl } from "./FloatingDeviceControl";
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
  canStart: boolean;
  onSetCompactMode: (compact: boolean) => void;
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
              className={cx(
                "grid size-8 place-items-center rounded-md border-0 bg-transparent hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40",
                props.systemAudioEnabled ? "text-emerald-300" : "text-slate-300"
              )}
              type="button"
              aria-label={systemAudioLabel}
              aria-pressed={props.systemAudioEnabled}
              title={systemAudioLabel}
              onClick={props.onToggleSystemAudio}
              disabled={!props.canStart}
            >
              {props.systemAudioEnabled ? <Volume2 size={19} /> : <VolumeX size={19} />}
            </button>
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
              aria-label="Collapse"
              title={isRecordingActive ? undefined : "Collapse"}
              onClick={() => props.onSetCompactMode(true)}
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

        <footer className="grid grid-cols-3 gap-2 border-t border-white/[0.07] p-3">
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
            className="grid min-h-16 place-items-center gap-1 rounded-lg border border-white/10 bg-white/[0.045] px-2 text-center text-[0.68rem] font-extrabold text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
            type="button"
            onClick={props.onChooseFolder}
            disabled={!props.canStart}
            title={props.baseDirectory ?? "Choose project folder"}
          >
            <FolderOpen size={25} />
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

function RecorderBody(props: Parameters<typeof RecorderControllerView>[0]) {
  const isRecordingActive = props.state === "recording" || props.state === "paused";
  const primaryActionLabel = isRecordingActive ? "Stop recording" : "Start recording";

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

      <button
        className={cx(
          "grid size-[76px] place-items-center rounded-full border-0 bg-rose-600 text-3xl font-extrabold text-white transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-70",
          (props.state === "recording" || props.state === "paused") &&
            "bg-red-700 hover:bg-red-800"
        )}
        type="button"
        disabled={
          props.state === "preparing" ||
          props.state === "countdown" ||
          props.state === "processing" ||
          props.state === "stopping"
        }
        onClick={() => {
          if (isRecordingActive) {
            props.onStopRecording();
          } else {
            props.onStartRecording();
          }
        }}
        aria-label={primaryActionLabel}
        title={isRecordingActive ? undefined : primaryActionLabel}
      >
        {props.state === "countdown" ? (
          props.countdown
        ) : isRecordingActive ? (
          <CircleStop size={34} />
        ) : null}
      </button>

      {isRecordingActive ? (
        <div className="absolute bottom-14 inline-flex items-center gap-2">
          <button
            className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/15"
            type="button"
            onClick={props.state === "paused" ? props.onResumeRecording : props.onPauseRecording}
            aria-label={props.state === "paused" ? "Resume recording" : "Pause recording"}
          >
            {props.state === "paused" ? <Play size={17} /> : <Pause size={17} />}
            <span>{props.state === "paused" ? "Resume" : "Pause"}</span>
          </button>
          <button
            className="inline-flex h-9 items-center gap-2 rounded-full border border-red-300/30 bg-red-500/15 px-4 text-sm font-bold text-red-100 hover:bg-red-500/25"
            type="button"
            onClick={props.onCancelRecording}
            aria-label="Cancel recording"
          >
            <X size={17} />
            <span>Cancel</span>
          </button>
          <button
            className="inline-flex h-9 items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-500/15 px-4 text-sm font-bold text-emerald-100 hover:bg-emerald-500/25"
            type="button"
            onClick={props.onStopRecording}
            aria-label="Finish recording"
          >
            <CheckCircle2 size={17} />
            <span>Done</span>
          </button>
        </div>
      ) : null}

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
