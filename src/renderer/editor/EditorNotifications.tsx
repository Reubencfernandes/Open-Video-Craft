/** Maps editor state to the shared bottom-center notification card. */
import { useEffect } from "react";
import { FloatingNotification } from "../notifications/FloatingNotification";

interface EditorNotificationsProps {
  error: string | null;
  exportMessage: string | null;
  onDismissError: () => void;
  onDismissMessage: () => void;
}

/**
 * Brief confirmations ("Clip copied", "Project saved") dismiss themselves so
 * the card never sits over the timeline mid-edit. Longer messages, such as an
 * export result with its file path, stay until the user closes them.
 */
const briefMessageMaxLength = 40;
const briefMessageTimeoutMs = 2500;

export function EditorNotifications(props: EditorNotificationsProps) {
  const { error, exportMessage, onDismissMessage } = props;
  const isBrief = !error && exportMessage !== null && exportMessage.length <= briefMessageMaxLength;

  useEffect(() => {
    if (!isBrief) return undefined;
    const timeout = window.setTimeout(onDismissMessage, briefMessageTimeoutMs);
    return () => window.clearTimeout(timeout);
    // Restart only for a new message; the dismiss callback identity may churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBrief, exportMessage]);

  // Errors take priority so a success message can never obscure a failure.
  if (error) {
    return <FloatingNotification kind="error" title="We are so sorry!" message={error} onDismiss={props.onDismissError} />;
  }

  return exportMessage ? (
    <FloatingNotification kind="success" title="All done!" message={exportMessage} onDismiss={onDismissMessage} />
  ) : null;
}
