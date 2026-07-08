export const recordingRuntime = {
  audioBitsPerSecond: 128_000,
  chunkMs: 5_000,
  elapsedUpdateMs: 1_000,
  overlayHideBeforeCaptureMs: 160,
  projectUiSyncMs: 15_000,
  recorderProtectionSettleMs: 80,
  screenFrameRate: 30,
  videoBitsPerSecond: 8_000_000
};

export type RecorderKind = "audio" | "video";

export function createMediaRecorderOptions(
  kind: RecorderKind,
  mimeType: string
): MediaRecorderOptions {
  return kind === "audio"
    ? {
        audioBitsPerSecond: recordingRuntime.audioBitsPerSecond,
        mimeType
      }
    : {
        mimeType,
        videoBitsPerSecond: recordingRuntime.videoBitsPerSecond
      };
}

export function createDisplayCaptureOptions(): DisplayMediaStreamOptions {
  return {
    video: {
      frameRate: recordingRuntime.screenFrameRate
    },
    audio: false
  };
}
