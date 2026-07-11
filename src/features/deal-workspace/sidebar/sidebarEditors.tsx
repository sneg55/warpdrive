"use client";
import type React from "react";

// Refresh the route to pull server-true values after an inline save, swallowing any failure. The
// mutation is already committed by the time we refresh, so a refresh error (transient RSC re-fetch
// hiccup, an interrupted transition) must NOT bubble out and make a successful save look failed:
// that surfaced a false "Couldn't save" on a record that actually persisted. Shared by the sidebar
// blocks (PersonBlock/OrgBlock) whose Save footer treats a rejected onSave promise as a failure.
export function refreshQuietly(router: { refresh: () => void }): void {
  try {
    router.refresh();
  } catch {
    // Stale view until the next navigation is acceptable; a false failure banner is not.
  }
}

// Single-line text editor factory: each row gets its own aria-label (editor-firstName,
// editor-website, ...) so tests and screen readers can target the right field when several
// rows are mid-edit. Shared by PersonBlock and OrgBlock (previously duplicated verbatim in
// both, Finding 2).
export function textEditor(ariaLabel: string) {
  return ({
    draft,
    setDraft,
  }: {
    draft: string;
    setDraft: (v: string) => void;
  }): React.ReactNode => (
    <input
      aria-label={ariaLabel}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      className="w-full rounded-md border px-2 py-1 text-sm"
    />
  );
}
