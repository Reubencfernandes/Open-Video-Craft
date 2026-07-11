/** Maps editor state to the shared bottom-center notification card. */
import { FloatingNotification } from "../notifications/FloatingNotification";

interface EditorNotificationsProps {
  error: string | null;
  exportMessage: string | null;
  onDismissError: () => void;
  onDismissMessage: () => void;
}

export function EditorNotifications(props: EditorNotificationsProps) {
  // Errors take priority so a success message can never obscure a failure.
  if (props.error) {
    return <FloatingNotification kind="error" title="We are so sorry!" message={props.error} onDismiss={props.onDismissError} />;
  }

  return props.exportMessage ? (
    <FloatingNotification kind="success" title="All done!" message={props.exportMessage} onDismiss={props.onDismissMessage} />
  ) : null;
}
