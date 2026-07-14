/** Local, cacheable media analysis used by the MCP server. */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { resolveFfmpegPath } from "./ffmpeg";
import type { EditorProjectStateFile, ProjectFile } from "../shared/types";
import type { SubtitleSegment, SubtitleWord } from "../shared/editor-domain";

export interface ProjectAnalysis {
  schemaVersion: 2;
  projectId: string;
  fingerprint: string;
  generatedAt: string;
  status: "complete";
  timelineDurationSeconds: number;
  transcript: { language: string | null; segments: SubtitleSegment[] };
  silenceRanges: Array<{ start: number; end: number; duration: number }>;
  contactSheets: Array<{
    page: number;
    relativePath: string;
    mimeType: "image/jpeg";
    startTime: number;
    endTime: number;
    intervalSeconds: number;
    sampleTimes: number[];
  }>;
  editCandidates: {
    fillerWords: Array<{ start: number; end: number; text: string }>;
    note: string;
  };
  warnings: string[];
}

export interface AnalysisJobStatus {
  jobId: string;
  projectId: string;
  status: "queued" | "analyzing" | "complete" | "error";
  progress: number;
  message: string;
  result?: ProjectAnalysis;
}

const jobs = new Map<string, AnalysisJobStatus>();
let cachedTranscriber: Promise<any> | null = null;

export async function startProjectAnalysis(input: {
  rootPath: string;
  project: ProjectFile;
  editor: EditorProjectStateFile | null;
  thumbnailIntervalSeconds?: number;
}): Promise<AnalysisJobStatus> {
  const fingerprint = await createFingerprint(input.rootPath, input.project, input.editor);
  const cached = await readCachedAnalysis(input.rootPath);
  if (cached?.fingerprint === fingerprint) {
    const job = { jobId: `cached-${fingerprint}`, projectId: input.project.id, status: "complete" as const, progress: 100, message: "Cached analysis is ready.", result: cached };
    jobs.set(job.jobId, job);
    return job;
  }
  const job: AnalysisJobStatus = { jobId: randomUUID(), projectId: input.project.id, status: "queued", progress: 0, message: "Analysis queued." };
  jobs.set(job.jobId, job);
  void runAnalysis(job, input, fingerprint).catch((error) => {
    job.status = "error"; job.message = error instanceof Error ? error.message : String(error);
  });
  return { ...job };
}

export function getProjectAnalysisJob(jobId: string): AnalysisJobStatus | null {
  const job = jobs.get(jobId);
  return job ? structuredClone(job) : null;
}

export async function readCachedAnalysis(rootPath: string): Promise<ProjectAnalysis | null> {
  try {
    const value = JSON.parse(await fs.readFile(path.join(rootPath, ".ovc", "analysis", "latest.json"), "utf8")) as ProjectAnalysis;
    return value?.schemaVersion === 2 && value.status === "complete" ? value : null;
  } catch { return null; }
}

export async function readContactSheet(rootPath: string, page: number): Promise<Buffer> {
  const analysis = await readCachedAnalysis(rootPath);
  const sheet = analysis?.contactSheets.find((item) => item.page === page);
  if (!sheet) throw new Error(`Contact-sheet page ${page} is unavailable.`);
  const absolute = path.resolve(rootPath, sheet.relativePath);
  const allowedRoot = `${path.resolve(rootPath)}${path.sep}`;
  if (!absolute.startsWith(allowedRoot)) throw new Error("Invalid contact-sheet path.");
  return fs.readFile(absolute);
}

async function runAnalysis(
  job: AnalysisJobStatus,
  input: { rootPath: string; project: ProjectFile; editor: EditorProjectStateFile | null; thumbnailIntervalSeconds?: number },
  fingerprint: string
) {
  job.status = "analyzing"; job.progress = 5; job.message = "Preparing local media analysis.";
  const analysisDirectory = path.join(input.rootPath, ".ovc", "analysis");
  await fs.mkdir(analysisDirectory, { recursive: true });
  const audioPath = resolveTrack(input.rootPath, input.project, ["micWav", "micWebm", "systemWav", "systemWebm"])
    ?? resolveImportedAnalysisSource(input.rootPath, input.editor, ["audio", "video"]);
  const videoPath = resolveTrack(input.rootPath, input.project, ["screen", "camera"])
    ?? resolveImportedAnalysisSource(input.rootPath, input.editor, ["video"]);
  const warnings: string[] = [];
  const importedDuration = videoPath
    ? input.editor?.imports.find((item) =>
        path.resolve(input.rootPath, item.relativePath) === path.resolve(videoPath)
      )?.duration ?? 0
    : 0;
  const editorDuration = input.editor?.state.timelineSegments.reduce(
    (maximum, segment) => Math.max(maximum, segment.end),
    0
  ) ?? 0;
  const knownDuration = Math.max(0, (input.project.durationMs ?? 0) / 1000, importedDuration, editorDuration);

  job.progress = 15; job.message = "Detecting silence.";
  const silenceRanges = audioPath ? await detectSilence(audioPath).catch((error) => {
    warnings.push(`Silence detection failed: ${messageOf(error)}`); return [];
  }) : [];

  job.progress = 35; job.message = "Creating visual contact sheet.";
  const contactSheets: ProjectAnalysis["contactSheets"] = [];
  if (videoPath) {
    const interval = Math.max(5, Math.min(120, input.thumbnailIntervalSeconds ?? 30));
    const pageDuration = interval * 16;
    const pageCount = Math.max(1, Math.min(20, Math.ceil(knownDuration / pageDuration) || 1));
    for (let page = 0; page < pageCount; page += 1) {
      const outputPath = path.join(analysisDirectory, `contact-sheet-${page}.jpg`);
      try {
        await runProcess(resolveFfmpegPath(), [
          "-y", "-ss", String(page * pageDuration), "-i", videoPath,
          "-vf", `fps=1/${interval},scale=320:-2,tile=4x4`, "-frames:v", "1", "-q:v", "3", outputPath
        ]);
        const startTime = page * pageDuration;
        const endTime = knownDuration > 0 ? Math.min(knownDuration, startTime + pageDuration) : startTime + pageDuration;
        const sampleTimes = Array.from({ length: 16 }, (_value, index) => startTime + index * interval)
          .filter((time) => time < endTime + 0.01);
        contactSheets.push({
          page,
          relativePath: `.ovc/analysis/contact-sheet-${page}.jpg`,
          mimeType: "image/jpeg",
          startTime,
          endTime,
          intervalSeconds: interval,
          sampleTimes
        });
      } catch (error) {
        warnings.push(`Contact-sheet page ${page} failed: ${messageOf(error)}`);
        break;
      }
    }
  }

  job.progress = 55; job.message = "Transcribing speech locally.";
  let segments = input.editor?.state.subtitles ?? [];
  let language = input.editor?.state.subtitleLanguage ?? null;
  if (segments.length === 0 && audioPath) {
    try {
      const transcript = await transcribeAudio(audioPath);
      segments = transcript.segments; language = transcript.language;
    } catch (error) { warnings.push(`Local transcription failed: ${messageOf(error)}`); }
  }

  const fillerWords = segments.flatMap((segment) => segment.words ?? [])
    .filter((word) => /^(?:um+|uh+|erm+|hmm+)\b/i.test(word.text.trim()))
    .map(({ start, end, text }) => ({ start, end, text }));
  const result: ProjectAnalysis = {
    schemaVersion: 2, projectId: input.project.id, fingerprint,
    generatedAt: new Date().toISOString(), status: "complete",
    timelineDurationSeconds: knownDuration,
    transcript: { language, segments },
    silenceRanges,
    contactSheets,
    editCandidates: {
      fillerWords,
      note: "Silence and filler detections are review candidates, not permission to remove content. Apply only the categories and intent in the user's request."
    },
    warnings
  };
  await fs.writeFile(path.join(analysisDirectory, "latest.json"), `${JSON.stringify(result, null, 2)}\n`);
  job.status = "complete"; job.progress = 100; job.message = "Analysis complete."; job.result = result;
}

async function transcribeAudio(audioPath: string): Promise<{ language: string | null; segments: SubtitleSegment[] }> {
  const pcm = await captureStdout(resolveFfmpegPath(), ["-i", audioPath, "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "pipe:1"]);
  const floats = new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
  const transformers = await import("@huggingface/transformers");
  transformers.env.allowLocalModels = false;
  cachedTranscriber ??= transformers.pipeline("automatic-speech-recognition", "onnx-community/whisper-base_timestamped");
  const transcriber = await cachedTranscriber;
  const output = await transcriber(floats, { return_timestamps: "word", chunk_length_s: 30, stride_length_s: 5 });
  const chunks = Array.isArray(output?.chunks) ? output.chunks : [];
  const words: SubtitleWord[] = chunks.flatMap((chunk: any) => {
    const start = chunk?.timestamp?.[0]; const end = chunk?.timestamp?.[1]; const text = String(chunk?.text ?? "").trim();
    return text && Number.isFinite(start) ? [{ start, end: Number.isFinite(end) ? Math.max(start + 0.05, end) : start + 0.28, text }] : [];
  });
  const segments: SubtitleSegment[] = [];
  for (let index = 0; index < words.length; index += 7) {
    const group = words.slice(index, index + 7);
    segments.push({ id: `subtitle-analysis-${index / 7}`, start: group[0].start, end: group.at(-1)?.end ?? group[0].end, text: group.map((word) => word.text).join(" ").replace(/\s+([,.!?])/g, "$1"), words: group });
  }
  const detected = chunks.find((chunk: any) => typeof chunk?.language === "string")?.language;
  return { language: detected ?? null, segments };
}

async function detectSilence(filePath: string) {
  const stderr = await captureStderr(resolveFfmpegPath(), ["-i", filePath, "-af", "silencedetect=noise=-40dB:d=0.4", "-f", "null", "-"]);
  const starts = [...stderr.matchAll(/silence_start:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  const ends = [...stderr.matchAll(/silence_end:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  return starts.map((start, index) => ({ start, end: ends[index] ?? start, duration: Math.max(0, (ends[index] ?? start) - start) })).filter((range) => range.duration > 0);
}

async function createFingerprint(rootPath: string, project: ProjectFile, editor: EditorProjectStateFile | null) {
  const hash = createHash("sha256");
  for (const track of Object.values(project.tracks)) {
    if (!track) continue;
    const stats = await fs.stat(path.join(rootPath, track.path)).catch(() => null);
    hash.update(`${track.path}:${stats?.size ?? 0}:${stats?.mtimeMs ?? 0};`);
  }
  for (const imported of editor?.imports ?? []) {
    const stats = await fs.stat(path.join(rootPath, imported.relativePath)).catch(() => null);
    hash.update(`${imported.relativePath}:${stats?.size ?? 0}:${stats?.mtimeMs ?? 0};`);
  }
  return hash.digest("hex").slice(0, 20);
}
function resolveTrack(rootPath: string, project: ProjectFile, keys: string[]): string | null {
  for (const key of keys) {
    const track = project.tracks[key as keyof typeof project.tracks];
    if (track?.path) return path.join(rootPath, track.path);
  }
  return null;
}
function resolveImportedAnalysisSource(
  rootPath: string,
  editor: EditorProjectStateFile | null,
  kinds: Array<"video" | "audio" | "image">
): string | null {
  const imported = editor?.imports.find((item) => kinds.includes(item.kind));
  if (!imported) return null;
  const absolute = path.resolve(rootPath, imported.relativePath);
  return absolute.startsWith(`${path.resolve(rootPath)}${path.sep}`) ? absolute : null;
}
function runProcess(command: string, args: string[]) { return capture(command, args).then(() => undefined); }
function captureStdout(command: string, args: string[]) { return capture(command, args).then((result) => result.stdout); }
function captureStderr(command: string, args: string[]) { return capture(command, args).then((result) => result.stderr.toString("utf8")); }
function capture(command: string, args: string[]): Promise<{ stdout: Buffer; stderr: Buffer }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, ["-hide_banner", "-nostdin", ...args], { windowsHide: true });
    const stdout: Buffer[] = []; const stderr: Buffer[] = []; let outputBytes = 0;
    child.stdout.on("data", (chunk: Buffer) => { outputBytes += chunk.length; if (outputBytes <= 512 * 1024 * 1024) stdout.push(chunk); else child.kill(); });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => code === 0
      ? resolve({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) })
      : reject(new Error(`FFmpeg exited with ${code}: ${Buffer.concat(stderr).toString("utf8").slice(-4000)}`)));
  });
}
function messageOf(error: unknown) { return error instanceof Error ? error.message : String(error); }
