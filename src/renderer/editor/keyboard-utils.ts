export function isKeyboardTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (
    target.isContentEditable ||
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

export function blurFocusedShortcutControl(): void {
  const activeElement = document.activeElement;
  if (
    activeElement instanceof HTMLElement &&
    activeElement !== document.body &&
    activeElement !== document.documentElement
  ) {
    activeElement.blur();
  }
}
