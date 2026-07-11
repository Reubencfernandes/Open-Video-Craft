/**
 * Recording constants (bitrates, chunk cadence, frame rate) and option
 * builders for MediaRecorder and getDisplayMedia.
 */
export const recordingRuntime = {
  audioBitsPerSecond: 128_000,
  chunkMs: 5_000,
  elapsedUpdateMs: 1_000,
  projectUiSyncMs: 15_000,
  screenFrameRate: 30,
  videoBitsPerSecond: 8_000_000
};

export type RecorderKind = "audio" | "video";

export function createMediaRecorderOptions(
  kind: RecorderKind,
  mimeType: string,
  videoBitsPerSecond: number = recordingRuntime.videoBitsPerSecond
): MediaRecorderOptions {
  return kind === "audio"
    ? {
        audioBitsPerSecond: recordingRuntime.audioBitsPerSecond,
        mimeType
      }
    : {
        mimeType,
        videoBitsPerSecond
      };
}

export function createDisplayCaptureOptions(
  systemAudio: boolean,
  maxHeight: number | null = null
): DisplayMediaStreamOptions {
  const video: MediaTrackConstraints = {
    frameRate: recordingRuntime.screenFrameRate
  };
  // A null max height keeps the display's native resolution (full screen); a
  // set height asks the capturer to downscale for a smaller recording.
  if (maxHeight) {
    video.height = { ideal: maxHeight };
  }

  return {
    video,
    // System/desktop audio comes through the main-process loopback handler; it
    // only yields a track when this constraint asks for audio.
    audio: systemAudio
  };
}
