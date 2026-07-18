"""One-shot ACE-Step v1-3.5B music generation wrapper for Open Video Craft.

Invoked as:  python acestep_generate.py <job.json>

The job file contains:
    {
      "prompt": str,             # comma-separated tags / description
      "lyrics": str,             # optional, [verse]/[chorus]/[bridge] markers
      "durationSeconds": float,
      "inferSteps": int,
      "guidanceScale": float,
      "seed": int | null,
      "outputPath": str,         # absolute .wav path to write
      "checkpointDir": str | null
    }

Protocol: newline-delimited JSON on stdout, everything else on stderr.
    {"type": "progress", "phase": "...", "percent": 0-100|null, "message": "..."}
    {"type": "result", "path": "..."}
    {"type": "error", "message": "..."}
"""

import contextlib
import json
import os
import sys
import threading
import time

HF_REPO = "ACE-Step/ACE-Step-v1-3.5B"


def emit(payload):
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def progress(phase, percent, message):
    emit({"type": "progress", "phase": phase, "percent": percent, "message": message})


def default_checkpoint_dir():
    return os.path.join(os.path.expanduser("~"), ".cache", "ace-step", "checkpoints")


def directory_size_bytes(root):
    total = 0
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
            with contextlib.suppress(OSError):
                total += os.path.getsize(os.path.join(dirpath, name))
    return total


def download_checkpoints(checkpoint_dir):
    """Download model weights with byte-level progress (roughly 7 GB)."""
    from huggingface_hub import snapshot_download

    expected_bytes = 7 * 1024 * 1024 * 1024
    stop = threading.Event()

    def poll():
        while not stop.is_set():
            done = directory_size_bytes(checkpoint_dir)
            percent = min(99.0, done / expected_bytes * 100.0)
            progress(
                "downloading-checkpoints",
                percent,
                "Downloading ACE-Step model (~7 GB, one time)…",
            )
            time.sleep(3)

    os.makedirs(checkpoint_dir, exist_ok=True)
    poller = threading.Thread(target=poll, daemon=True)
    poller.start()
    try:
        snapshot_download(repo_id=HF_REPO, local_dir=checkpoint_dir)
    finally:
        stop.set()
        poller.join(timeout=1)
    progress("downloading-checkpoints", 100, "Model download complete.")


def checkpoints_present(checkpoint_dir):
    if not os.path.isdir(checkpoint_dir):
        return False
    # The download is several GB; anything tiny is a partial/failed download.
    return directory_size_bytes(checkpoint_dir) > 2 * 1024 * 1024 * 1024


def main():
    if len(sys.argv) != 2:
        emit({"type": "error", "message": "Usage: acestep_generate.py <job.json>"})
        return 2

    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        job = json.load(handle)

    checkpoint_dir = job.get("checkpointDir") or default_checkpoint_dir()
    output_path = job["outputPath"]
    duration = float(job["durationSeconds"])
    infer_steps = int(job.get("inferSteps") or 27)
    guidance_scale = float(job.get("guidanceScale") or 15.0)
    seed = job.get("seed")

    try:
        if not checkpoints_present(checkpoint_dir):
            download_checkpoints(checkpoint_dir)

        progress("loading-model", None, "Loading ACE-Step pipeline…")
        from acestep.pipeline_ace_step import ACEStepPipeline

        # bf16 is unreliable on Apple silicon MPS; use fp32 there.
        use_bf16 = sys.platform != "darwin"
        pipeline = ACEStepPipeline(
            checkpoint_dir=checkpoint_dir,
            dtype="bfloat16" if use_bf16 else "float32",
        )

        progress("generating", None, "Generating music…")

        # Rough wall-clock progress: ~30 s per audio-minute on Apple silicon,
        # much faster on CUDA. The estimate only drives the progress bar.
        expected_seconds = max(20.0, duration / 60.0 * 40.0)
        started = time.monotonic()
        stop = threading.Event()

        def poll():
            while not stop.is_set():
                elapsed = time.monotonic() - started
                percent = min(95.0, elapsed / expected_seconds * 100.0)
                progress("generating", percent, "Generating music…")
                time.sleep(2)

        poller = threading.Thread(target=poll, daemon=True)
        poller.start()
        try:
            pipeline(
                prompt=job.get("prompt") or "",
                lyrics=job.get("lyrics") or "",
                audio_duration=duration,
                infer_step=infer_steps,
                guidance_scale=guidance_scale,
                manual_seeds=str(seed) if seed is not None else None,
                save_path=output_path,
            )
        finally:
            stop.set()
            poller.join(timeout=1)

        progress("saving", 100, "Saving audio…")

        if not os.path.isfile(output_path):
            # Some pipeline versions treat save_path as a directory or append
            # their own suffix — pick the newest audio file they produced.
            candidates = []
            search_dirs = {os.path.dirname(output_path) or "."}
            if os.path.isdir(output_path):
                search_dirs.add(output_path)
            for directory in search_dirs:
                for name in os.listdir(directory):
                    if name.lower().endswith((".wav", ".mp3", ".flac")):
                        candidates.append(os.path.join(directory, name))
            if not candidates:
                raise RuntimeError("ACE-Step finished but no audio file was produced.")
            newest = max(candidates, key=os.path.getmtime)
            if os.path.abspath(newest) != os.path.abspath(output_path):
                os.replace(newest, output_path)

        emit({"type": "result", "path": output_path})
        return 0
    except Exception as error:  # noqa: BLE001 - reported over the protocol
        emit({"type": "error", "message": f"{type(error).__name__}: {error}"})
        return 1


if __name__ == "__main__":
    sys.exit(main())
