"use client";
import { Pencil } from "lucide-react";
import type React from "react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const FIRST_ENABLED_CONTROL = [
  'input:not([type="hidden"]):not([disabled])',
  "textarea:not([disabled])",
  "select:not([disabled])",
  "button:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

interface InlineFieldShellProps {
  label: string;
  editing: boolean;
  onStartEdit: () => void;
  value?: React.ReactNode;
  valueElement?: "span" | "h1";
  valueClassName?: string;
  emptyPrompt?: string;
  children?: React.ReactNode;
}

export function InlineFieldShell({
  label,
  editing,
  onStartEdit,
  value,
  valueElement = "span",
  valueClassName,
  emptyPrompt,
  children,
}: InlineFieldShellProps): React.ReactNode {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) return;
    const editor = editorRef.current;
    if (editor === null || editor.contains(document.activeElement)) return;
    editor.querySelector<HTMLElement>(FIRST_ENABLED_CONTROL)?.focus({ preventScroll: true });
  }, [editing]);

  if (editing) return <div ref={editorRef}>{children}</div>;

  const empty = value === null || value === undefined;
  if (empty && emptyPrompt !== undefined) {
    return (
      <button
        type="button"
        onClick={onStartEdit}
        className="-mx-1 -my-0.5 rounded px-1 py-0.5 text-left text-sm text-link transition-[background-color,scale] duration-150 ease-out hover:bg-field-hover active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-colors"
      >
        {emptyPrompt}
      </button>
    );
  }

  const ValueElement = valueElement;
  return (
    <div className="group -mx-1 -my-1 relative flex min-w-0 items-center rounded px-1 py-1 pr-8 hover:bg-field-hover">
      <ValueElement
        className={cn(
          "min-w-0 cursor-text select-text break-words text-left text-sm",
          valueClassName,
        )}
      >
        {value}
      </ValueElement>
      <button
        type="button"
        aria-label={`Edit ${label}`}
        onClick={onStartEdit}
        className="absolute top-1/2 right-1 flex h-6 w-[26px] -translate-y-1/2 items-center justify-center rounded border border-field-border bg-card opacity-0 transition-[opacity,background-color,scale] duration-150 ease-out after:absolute after:-inset-1.5 after:content-[''] hover:bg-accent active:scale-[0.96] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 motion-reduce:transition-[opacity,background-color]"
      >
        <Pencil aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}
