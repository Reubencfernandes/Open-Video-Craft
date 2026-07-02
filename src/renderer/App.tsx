import { Film, ScreenShare } from "lucide-react";
import { useState } from "react";

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

  return (
    <main className="launcher-root">
      <section className="launcher-shell">
        <div className="launcher-brand">
          <div className="launcher-mark">
            <span />
            <span />
            <span />
          </div>
          <div>
            <p>Open Video Craft</p>
            <h1>Create or edit a video</h1>
          </div>
        </div>

        {errorMessage ? <div className="launcher-error">{errorMessage}</div> : null}

        <div className="launcher-actions">
          <button
            className="launcher-action launcher-action-primary"
            type="button"
            onClick={() => void openRecorder()}
            disabled={busyAction !== null}
          >
            <ScreenShare size={28} />
            <span>Record</span>
            <small>Open the floating recorder controller.</small>
          </button>

          <button
            className="launcher-action"
            type="button"
            onClick={() => void openEditor()}
            disabled={busyAction !== null}
          >
            <Film size={28} />
            <span>Edit</span>
            <small>Open the editor and import media.</small>
          </button>
        </div>
      </section>
    </main>
  );
}
