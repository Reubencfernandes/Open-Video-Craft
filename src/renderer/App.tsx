import { Film, ScreenShare } from "lucide-react";
import { useState } from "react";
import appLogo from "./assets/app.png";
import { cx } from "./classNames";

type LaunchAction = "record" | "edit";

export function App() {
  const [busyAction, setBusyAction] = useState<LaunchAction | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function openRecorder() {
    await runLaunchAction("record", () =>
      window.openVideoCraft.windows.openRecorderController()
    );
  }

  async function openEditor() {
    await runLaunchAction("edit", () => window.openVideoCraft.windows.openEditor(null));
  }

  async function runLaunchAction(
    action: LaunchAction,
    callback: () => Promise<boolean>
  ) {
    setBusyAction(action);
    setErrorMessage(null);

    try {
      await callback();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }

  const actionClassName =
    "group grid min-h-48 content-end justify-items-start gap-2 rounded-[10px] border border-transparent bg-transparent p-4 text-left text-white transition duration-150 hover:-translate-y-0.5 hover:border-emerald-500 focus-visible:-translate-y-0.5 focus-visible:border-emerald-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[linear-gradient(171deg,rgb(13_18_28),rgb(249_115_22)_58%,rgb(125_65_149))] bg-[length:220%_220%] p-8 text-white animate-[launcher-gradient-shift_20s_ease-in-out_infinite] before:pointer-events-none before:absolute before:inset-[-25%_-15%_-35%] before:z-0 before:bg-[radial-gradient(58%_55%_at_50%_100%,rgb(125_65_149_/_0.72),transparent_70%)] before:blur-[34px] before:content-[''] before:animate-[launcher-wave_9s_ease-in-out_infinite]">
      <section className="relative z-10 grid w-[min(100%,760px)] gap-5 rounded-[14px] border border-transparent bg-[#121317] p-6 shadow-[0_34px_90px_rgb(0_0_0_/_0.45)]">
        <div className="flex items-center gap-4">
          <div className="relative size-10">
            <img className="block size-full object-contain" src={appLogo} alt="" />
          </div>
          <div>
            <p className="m-0 text-[0.82rem] font-bold uppercase text-slate-400">
              Open Video Craft
            </p>
            <h1 className="m-0 mt-1 text-[1.65rem] font-bold">Create or edit a video</h1>
          </div>
        </div>

        {errorMessage ? (
          <div className="rounded-lg border border-red-400/35 bg-red-500/12 px-4 py-3 text-sm font-semibold text-red-100">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <button
            className={cx(actionClassName, "border-emerald-500/40")}
            type="button"
            onClick={() => void openRecorder()}
            disabled={busyAction !== null}
          >
            <ScreenShare className="text-emerald-400" size={28} />
            <span className="text-xl font-extrabold">Record</span>
            <small className="max-w-64 text-[0.8rem] leading-5 text-slate-400">
              Open the floating recorder controller.
            </small>
          </button>

          <button
            className={actionClassName}
            type="button"
            onClick={() => void openEditor()}
            disabled={busyAction !== null}
          >
            <Film className="text-sky-400" size={28} />
            <span className="text-xl font-extrabold">Edit</span>
            <small className="max-w-64 text-[0.8rem] leading-5 text-slate-400">
              Open the editor and import media.
            </small>
          </button>
        </div>
      </section>
    </main>
  );
}
