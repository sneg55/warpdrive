"use client";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const COLOR_OPTIONS = [
  { label: "Black", value: "#000000" },
  { label: "Slate", value: "#475569" },
  { label: "Red", value: "#dc2626" },
  { label: "Orange", value: "#ea580c" },
  { label: "Amber", value: "#d97706" },
  { label: "Green", value: "#16a34a" },
  { label: "Teal", value: "#0d9488" },
  { label: "Blue", value: "#2563eb" },
  { label: "Indigo", value: "#4f46e5" },
  { label: "Purple", value: "#9333ea" },
  { label: "Pink", value: "#db2777" },
  { label: "White", value: "#ffffff" },
] as const;

interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  triggerClassName?: string;
}

export function ColorPicker({
  value,
  onChange,
  ariaLabel,
  triggerClassName,
}: ColorPickerProps): React.ReactNode {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean): void {
    setOpen(next);
    if (next) {
      setDraft(value);
      setError(null);
    }
  }

  function choose(next: string): void {
    onChange(next);
    setOpen(false);
  }

  function applyCustom(): void {
    const normalized = draft.trim().toLowerCase();
    if (!HEX_COLOR.test(normalized)) {
      setError("Enter a 6-digit hex color, such as #1f2937.");
      return;
    }
    choose(normalized);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tip label={ariaLabel}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={ariaLabel}
            className={cn("relative", triggerClassName)}
          >
            <span
              aria-hidden="true"
              className="size-4 rounded-full ring-1 ring-black/10 dark:ring-white/10"
              style={{ backgroundColor: value }}
            />
          </Button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent className="w-52 space-y-3 p-3" aria-label={`${ariaLabel} options`}>
        <div className="grid grid-cols-4 gap-1">
          {COLOR_OPTIONS.map((color) => (
            <Button
              key={color.value}
              variant="ghost"
              size="icon"
              aria-label={color.label}
              aria-pressed={value.toLowerCase() === color.value}
              onClick={() => choose(color.value)}
              className="size-10 p-2"
            >
              <span
                aria-hidden="true"
                className="size-5 rounded-full ring-1 ring-black/10 dark:ring-white/10"
                style={{ backgroundColor: color.value }}
              />
            </Button>
          ))}
        </div>
        <form
          className="space-y-2 border-t pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            applyCustom();
          }}
        >
          <label htmlFor={inputId} className="block text-xs font-medium">
            Custom hex color
          </label>
          <Input
            id={inputId}
            name="customHexColor"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. #1f2937…"
            maxLength={7}
          />
          {error !== null ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="sm" className="w-full">
            Apply color
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
