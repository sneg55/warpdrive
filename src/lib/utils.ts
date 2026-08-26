import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// text-display is declared in globals.css, so tailwind-merge ships no rule for it and would read
// it as a text colour: a later text-foreground then drops the size, with nothing reporting it.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": ["text-display"] } },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
