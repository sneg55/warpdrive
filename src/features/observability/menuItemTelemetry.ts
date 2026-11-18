import { MENU_ITEM_LABEL_MAX_LENGTH, TELEMETRY_REDACT_ATTRIBUTE } from "@/constants/observability";
import { capture, currentRoute } from "./capture";
import { EVENTS } from "./events";

export type MenuItemKind = "item" | "checkbox" | "radio";

interface MenuItemSelection {
  item: HTMLElement | null;
  kind: MenuItemKind;
  redactLabel: boolean;
  disabled: boolean;
}

function clean(text: string | null | undefined): string | undefined {
  const trimmed = (text ?? "").replace(/\s+/g, " ").trim();
  if (trimmed === "") return undefined;
  return trimmed.slice(0, MENU_ITEM_LABEL_MAX_LENGTH);
}

function triggerFor(item: HTMLElement): HTMLElement | null {
  const menu = item.closest('[role="menu"]');
  const triggerId = menu?.getAttribute("aria-labelledby");
  if (triggerId === null || triggerId === undefined) return null;
  return item.ownerDocument.getElementById(triggerId);
}

function triggerLabel(item: HTMLElement): string | undefined {
  const trigger = triggerFor(item);
  if (trigger?.hasAttribute(TELEMETRY_REDACT_ATTRIBUTE) === true) return undefined;
  return clean(trigger?.getAttribute("aria-label"));
}

export function captureMenuItemSelected(sel: MenuItemSelection): void {
  const props: Record<string, unknown> = {
    disabled: sel.disabled,
    kind: sel.kind,
    route: currentRoute(),
  };
  if (sel.item !== null) {
    const trigger = triggerLabel(sel.item);
    if (trigger !== undefined) props.triggerLabel = trigger;
    if (!sel.redactLabel) {
      const label = clean(sel.item.textContent) ?? clean(sel.item.getAttribute("aria-label"));
      if (label !== undefined) props.itemLabel = label;
    }
  }
  capture(EVENTS.menuItemSelected, props);
}
