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
  videoBitsPerSecond: 8_000_000,
  // Every editor seek decodes forward from the previous keyframe. Chromium's
  // default spacing (~3–4 s) makes playhead scrubbing stall on 1080p VP9; one
  // keyframe per second costs only a few percent more file size.
  videoKeyFrameIntervalMs: 1_000
};

export type RecorderKind = "audio" | "video";

/** Chromium also accepts keyframe spacing, which older DOM typings omit. */
type RecorderOptions = MediaRecorderOptions & { videoKeyFrameIntervalDuration?: number };

export function createMediaRecorderOptions(
  kind: RecorderKind,
  mimeType: string,
  videoBitsPerSecond: number = recordingRuntime.videoBitsPerSecond
): RecorderOptions {
  return kind === "audio"
    ? {
        audioBitsPerSecond: recordingRuntime.audioBitsPerSecond,
        mimeType
      }
    : {
        mimeType,
        videoBitsPerSecond,
        videoKeyFrameIntervalDuration: recordingRuntime.videoKeyFrameIntervalMs
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
