import { ArrowUp, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DesktopPermissionKind } from "../shared/types";
import appLogo from "./assets/app.png";
import { cx } from "./classNames";

const permissionNames: Record<DesktopPermissionKind, string> = {
  screen: "Screen Recording",
  camera: "Camera",
  microphone: "Microphone"
};

export function PermissionGuideOverlay() {
  const kind = useMemo(() => getPermissionKindFromUrl(), []);
  const [draggingApp, setDraggingApp] = useState(false);
  const dragResetTimerRef = useRef<number | null>(null);
  const permissionName = permissionNames[kind];

  useEffect(() => {
    function clearDragState() {
      setDraggingApp(false);
      if (dragResetTimerRef.current !== null) {
        window.clearTimeout(dragResetTimerRef.current);
        dragResetTimerRef.current = null;
      }
    }

    window.addEventListener("dragend", clearDragState);
    window.addEventListener("drop", clearDragState);
    window.addEventListener("mouseup", clearDragState);
    window.addEventListener("pointerup", clearDragState);
    window.addEventListener("blur", clearDragState);
    window.addEventListener("focus", clearDragState);
    window.addEventListener("keydown", clearDragState);

    return () => {
      window.removeEventListener("dragend", clearDragState);
      window.removeEventListener("drop", clearDragState);
      window.removeEventListener("mouseup", clearDragState);
      window.removeEventListener("pointerup", clearDragState);
      window.removeEventListener("blur", clearDragState);
      window.removeEventListener("focus", clearDragState);
      window.removeEventListener("keydown", clearDragState);

      if (dragResetTimerRef.current !== null) {
        window.clearTimeout(dragResetTimerRef.current);
      }
    };
  }, []);

  function startNativeAppDrag() {
    setDraggingApp(true);
    window.openVideoCraft.permissions.startAppDrag();

    if (dragResetTimerRef.current !== null) {
      window.clearTimeout(dragResetTimerRef.current);
    }

    // Native file drags can complete outside Chromium without a dragend event.
    dragResetTimerRef.current = window.setTimeout(() => {
      setDraggingApp(false);
      dragResetTimerRef.current = null;
    }, 900);
  }

  return (
    <main className="grid h-full w-full place-items-center bg-transparent p-2 text-white">
      <section className="relative w-full rounded-[20px] border border-white/[0.16] bg-[#20292c]/95 p-3.5 shadow-[0_18px_42px_rgb(0_0_0_/_0.44)] backdrop-blur">
        <button
          className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-white/[0.08] text-slate-100 hover:bg-white/[0.16]"
          type="button"
          onClick={() => void window.openVideoCraft.windows.closeCurrent()}
          title="Close guide"
          aria-label="Close permission guide"
        >
          <X size={17} strokeWidth={2.5} />
        </button>

        <div className="grid min-w-0 gap-2 pr-9">
          <div className="flex min-w-0 items-center gap-2.5">
            <ArrowUp className="shrink-0 text-sky-200 drop-shadow-[0_1px_0_rgb(255_255_255_/_0.5)]" size={31} />
            <h1 className="m-0 min-w-0 text-[0.95rem] font-extrabold leading-5 text-white">
              Drag Open Video Craft to the list above to allow {permissionName}
            </h1>
          </div>

          <div
            className={cx(
              "grid grid-cols-[auto_1fr] items-center gap-2.5 rounded-xl border border-white/10 bg-[#273033] px-2.5 py-2 transition",
              draggingApp ? "cursor-default opacity-70" : "cursor-grab active:cursor-grabbing"
            )}
            draggable={!draggingApp}
            onDragEnd={() => setDraggingApp(false)}
            onDragStart={(event) => {
              event.preventDefault();
              startNativeAppDrag();
            }}
            title="Drag this app tile into the System Settings permission list"
          >
            <img className="size-9 shrink-0 rounded-lg object-contain" src={appLogo} alt="" />
            <div className="min-w-0">
              <strong className="block truncate text-sm text-white">Open Video Craft</strong>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function getPermissionKindFromUrl(): DesktopPermissionKind {
  const value = new URLSearchParams(window.location.search).get("kind");
  return value === "camera" || value === "microphone" ? value : "screen";
}
