/** Pure store for transient Matrix-style popup messages. */
import type {
  MatrixPopupPosition as SharedMatrixPopupPosition,
  MatrixPopupRequest,
  MatrixPopupTone as SharedMatrixPopupTone
} from "../../shared/types";

export type MatrixPopupPosition = SharedMatrixPopupPosition;

export type MatrixPopupTone = SharedMatrixPopupTone;

export type MatrixPopupOptions = MatrixPopupRequest;

export interface MatrixPopup extends Required<Omit<MatrixPopupOptions, "id" | "title">> {
  readonly id: string;
  readonly title: string | undefined;
  readonly createdAt: number;
  readonly phase: "entering" | "visible" | "exiting";
}

export interface MatrixPopupStore {
  show(options: MatrixPopupOptions): string;
  dismiss(id: string): void;
  pause(id: string): void;
  resume(id: string): void;
  clear(): void;
  getSnapshot(): readonly MatrixPopup[];
  subscribe(listener: () => void): () => void;
}

export type MatrixPopupTimerHandle = ReturnType<typeof setTimeout>;

export interface MatrixPopupStoreConfig {
  readonly now?: () => number;
  readonly exitMs?: number;
  readonly maxVisible?: number;
  readonly setTimer?: (callback: () => void, delayMs: number) => MatrixPopupTimerHandle;
  readonly clearTimer?: (handle: MatrixPopupTimerHandle) => void;
}

interface PopupTimer {
  readonly kind: "auto" | "exit";
  readonly remainingMs: number;
  readonly startedAt: number;
  handle: MatrixPopupTimerHandle | null;
}

const DEFAULT_EXIT_MS = 180;
const DEFAULT_MAX_VISIBLE = 5;

export function normalizeMatrixPopup(
  options: MatrixPopupOptions,
  id: string,
  now: number
): MatrixPopup {
  return {
    id,
    title: options.title?.trim() || undefined,
    text: options.text,
    tone: options.tone ?? "info",
    position: options.position ?? "bottom-right",
    durationMs: Math.max(0, options.durationMs ?? 4200),
    accentColor: options.accentColor ?? "#39ff88",
    backgroundColor: options.backgroundColor ?? "rgba(1, 8, 4, 0.86)",
    textColor: options.textColor ?? "#d8ffe7",
    fontFamily: options.fontFamily ?? "'Courier New', Courier, monospace",
    fontSize: Math.max(10, Math.min(32, options.fontSize ?? 14)),
    fontWeight: Math.max(400, Math.min(900, options.fontWeight ?? 700)),
    borderRadius: Math.max(0, Math.min(32, options.borderRadius ?? 8)),
    padding: Math.max(4, Math.min(64, options.padding ?? 16)),
    width: Math.max(180, Math.min(900, options.width ?? 360)),
    scanlines: options.scanlines ?? true,
    closable: options.closable ?? true,
    pauseOnHover: options.pauseOnHover ?? true,
    createdAt: now,
    phase: "entering"
  };
}

export function createMatrixPopupStore(config: MatrixPopupStoreConfig = {}): MatrixPopupStore {
  const now = config.now ?? Date.now;
  const exitMs = config.exitMs ?? DEFAULT_EXIT_MS;
  const maxVisible = config.maxVisible ?? DEFAULT_MAX_VISIBLE;
  const setTimer = config.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const clearTimer = config.clearTimer ?? ((handle) => clearTimeout(handle));

  let popups: readonly MatrixPopup[] = [];
  let sequence = 0;
  const listeners = new Set<() => void>();
  const timers = new Map<string, PopupTimer>();

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function cancelTimer(id: string): void {
    const timer = timers.get(id);
    if (timer?.handle !== null && timer?.handle !== undefined) clearTimer(timer.handle);
    timers.delete(id);
  }

  function scheduleTimer(id: string, kind: PopupTimer["kind"], delayMs: number): void {
    const timer: PopupTimer = { kind, remainingMs: delayMs, startedAt: now(), handle: null };
    timer.handle = setTimer(() => {
      timers.delete(id);
      if (kind === "exit") remove(id);
      else dismiss(id);
    }, delayMs);
    timers.set(id, timer);
  }

  function remove(id: string): void {
    cancelTimer(id);
    const next = popups.filter((popup) => popup.id !== id);
    if (next.length === popups.length) return;
    popups = next;
    emit();
  }

  function dismiss(id: string): void {
    const popup = popups.find((entry) => entry.id === id);
    if (popup === undefined || popup.phase === "exiting") return;
    popups = popups.map((entry) => entry.id === id ? { ...entry, phase: "exiting" } : entry);
    emit();
    cancelTimer(id);
    scheduleTimer(id, "exit", exitMs);
  }

  function pause(id: string): void {
    const timer = timers.get(id);
    if (timer === undefined || timer.kind !== "auto" || timer.handle === null) return;
    clearTimer(timer.handle);
    timers.set(id, {
      ...timer,
      handle: null,
      remainingMs: Math.max(0, timer.remainingMs - (now() - timer.startedAt))
    });
  }

  function resume(id: string): void {
    const timer = timers.get(id);
    if (timer === undefined || timer.kind !== "auto" || timer.handle !== null) return;
    scheduleTimer(id, "auto", timer.remainingMs);
  }

  function show(options: MatrixPopupOptions): string {
    sequence += 1;
    const id = options.id ?? `matrix-popup-${now()}-${sequence}`;
    const popup = normalizeMatrixPopup(options, id, now());
    popups = [...popups, popup].slice(-maxVisible);
    emit();

    if (popup.durationMs > 0) {
      scheduleTimer(id, "auto", popup.durationMs);
    }
    return id;
  }

  function clear(): void {
    for (const timer of timers.values()) {
      if (timer.handle !== null) clearTimer(timer.handle);
    }
    timers.clear();
    popups = [];
    emit();
  }

  return {
    show,
    dismiss,
    pause,
    resume,
    clear,
    getSnapshot: () => popups,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
