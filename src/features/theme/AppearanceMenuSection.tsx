"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import type React from "react";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { APPEARANCE_VALUES, type Appearance } from "./appearance";
import type { AppearanceChoice } from "./useAppearanceChoice";

const LABELS: Record<Appearance, string> = {
  day: "Day",
  night: "Night",
  system: "System",
};

const ICONS: Record<Appearance, typeof Sun> = {
  day: Sun,
  night: Moon,
  system: Monitor,
};

const SECTION_LABEL = "Appearance";

export function AppearanceMenuSection({ choice }: { choice: AppearanceChoice }): React.ReactNode {
  return (
    <>
      <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {SECTION_LABEL}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup value={choice.value} onValueChange={choice.choose}>
        {APPEARANCE_VALUES.map((option) => {
          const Icon = ICONS[option];
          return (
            <DropdownMenuRadioItem key={option} value={option} className="gap-2.5">
              <Icon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
              {LABELS[option]}
            </DropdownMenuRadioItem>
          );
        })}
      </DropdownMenuRadioGroup>
    </>
  );
}
