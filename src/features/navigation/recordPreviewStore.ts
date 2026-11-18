"use client";
import { create } from "zustand";

export interface RecordPreview {
  id: string;
  title: string;
  subtitle?: string;
}

interface RecordPreviewState {
  preview: RecordPreview | null;
  setPreview: (preview: RecordPreview) => void;
  clearPreview: () => void;
}

export const useRecordPreview = create<RecordPreviewState>((set) => ({
  preview: null,
  setPreview: (preview) => set({ preview }),
  clearPreview: () => set({ preview: null }),
}));
