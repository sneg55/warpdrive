// Guards shared by every global shortcut: a bare letter or digit must never fire while the user is
// typing, and must never fire underneath an open menu/dialog (those own their own key handling).

// Radix drives comboboxes and spinbuttons with printable-key type-ahead, so their triggers consume
// bare letters exactly like a text field even though they are buttons.
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
  // closest(), not the element itself: a keydown inside the rich-text composer targets whichever
  // node the caret sits in, not the contenteditable host, and a Select trigger wraps its own label.
  return target.closest(TYPE_AHEAD) !== null;
}

// Only genuinely floating layers count. role="listbox" is deliberately absent: StageSelector
// renders one inline on every deal workspace, which would leave the shortcuts dead there. Radix
// portals its own open listboxes and popovers inside a popper wrapper, so those are still caught.
const OVERLAY_SELECTOR =
  '[role="dialog"],[role="alertdialog"],[role="menu"],[data-radix-popper-content-wrapper]';

export function isOverlayOpen(doc: Document): boolean {
  return doc.querySelector(OVERLAY_SELECTOR) !== null;
}
