"use client";
import { Check, Copy, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { STRINGS } from "@/constants/strings";

const S = STRINGS.landing.selfHost;
const RESET_MS = 2000;

type CopyState = "idle" | "copied" | "failed";

interface CommandLine {
  readonly text: string;
  readonly comment: string | null;
}

const LABELS: Record<CopyState, string> = { idle: S.copy, copied: S.copied, failed: S.copyFailed };
const ICONS = { idle: Copy, copied: Check, failed: TriangleAlert } as const;

export function CopyCommands({ lines }: { lines: readonly CommandLine[] }): ReactNode {
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), RESET_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lines.map((line) => line.text).join("\n"));
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  const Icon = ICONS[state];
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 font-sans text-xs font-medium text-primary-foreground/70 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/40"
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span aria-live="polite">{LABELS[state]}</span>
    </button>
  );
}
