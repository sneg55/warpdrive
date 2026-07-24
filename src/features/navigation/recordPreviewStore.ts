"use client";
import { create } from "zustand";

// The minimal fields the list already knows about a record, shown instantly in the drawer skeleton
// so opening a detail paints the real name (not a gray bar) while the server content streams in.
export interface RecordPreview {
  // The record id, so the skeleton only trusts a preview that matches the route it is loading (a
  // stale preview from a previous open is ignored rather than flashing the wrong name).
  id: string;
  title: string;
  subtitle?: string;
}

interface RecordPreviewState {
  preview: RecordPreview | null;
  // Set synchronously on row click, before router.push, so the skeleton reads it on first paint.
  setPreview: (preview: RecordPreview) => void;
  clearPreview: () => void;
}

// A tiny global store (not per-tree context) because the setter fires from a list row while the
// reader is the intercepted drawer skeleton, two sibling subtrees that never share a provider.
export const useRecordPreview = create<RecordPreviewState>((set) => ({
  preview: null,
  setPreview: (preview) => set({ preview }),
  clearPreview: () => set({ preview: null }),
}));
