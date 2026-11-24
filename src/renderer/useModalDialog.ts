/**
 * Keyboard behavior every modal dialog needs: focus moves into the dialog when
 * it opens (so Tab and screen readers start there instead of behind the
 * backdrop), Escape closes it, and focus returns to the control that opened it.
 */
import { useEffect, useRef } from "react";

export function useModalDialog<T extends HTMLElement>(options: {
  open: boolean;
  onClose: () => void;
  /** Ignore Escape, e.g. while an export that cannot be abandoned runs. */
  closeDisabled?: boolean;
}) {
  const dialogRef = useRef<T | null>(null);
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    if (!options.open) return undefined;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) {
      if (!dialog.hasAttribute("tabindex")) dialog.setAttribute("tabindex", "-1");
      dialog.focus({ preventScroll: true });
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || latest.current.closeDisabled) return;
      event.preventDefault();
      event.stopPropagation();
      latest.current.onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [options.open]);

  return dialogRef;
}

/** True while any modal dialog is open; global shortcuts stand down then. */
export function isModalDialogOpen(root: ParentNode = document): boolean {
  return Boolean(root.querySelector('[aria-modal="true"]'));
}
