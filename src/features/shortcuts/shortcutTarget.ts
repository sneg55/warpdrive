const TYPE_AHEAD =
  '[role="combobox"],[role="textbox"],[role="searchbox"],[role="spinbutton"],[contenteditable=""],[contenteditable="true"]';

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }
  return target.closest(TYPE_AHEAD) !== null;
}

const OVERLAY_SELECTOR =
  '[role="dialog"],[role="alertdialog"],[role="menu"],[data-radix-popper-content-wrapper]';

export function isOverlayOpen(doc: Document): boolean {
  return doc.querySelector(OVERLAY_SELECTOR) !== null;
}
