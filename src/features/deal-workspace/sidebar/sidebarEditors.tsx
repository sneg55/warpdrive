"use client";
import type React from "react";
import { Input } from "@/components/ui/Input";

export function refreshQuietly(router: { refresh: () => void }): void {
  try {
    router.refresh();
  } catch {}
}

export function textEditor(ariaLabel: string) {
  return ({
    draft,
    setDraft,
  }: {
    draft: string;
    setDraft: (v: string) => void;
  }): React.ReactNode => (
    <Input
      aria-label={ariaLabel}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      className="h-8 px-2 py-1"
    />
  );
}
