/**
 * Keyboard helpers for keeping global editor shortcuts out of focused native
 * and ARIA controls.
 */
export function isKeyboardTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const contentEditableRoot = target.closest<HTMLElement>("[contenteditable]");
  const isWithinEditableContent =
    target.isContentEditable ||
    (contentEditableRoot !== null &&
      contentEditableRoot.getAttribute("contenteditable")?.toLowerCase() !== "false");

  if (
    isWithinEditableContent ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }

  if (!(target instanceof HTMLInputElement)) {
    return false;
  }

  return !["button", "checkbox", "color", "file", "radio", "range", "reset", "submit"].includes(
    target.type
  );
}

/** Controls that must keep their native Space/arrow/delete key behavior. */
export function isKeyboardInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      "button, input, select, textarea, a[href], [contenteditable='true'], " +
      "[role='button'], [role='checkbox'], [role='radio'], [role='switch'], " +
      "[role='slider'], [role='combobox'], [role='listbox'], [role='menuitem'], [role='tab']"
    )
  );
}
