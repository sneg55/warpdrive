"use client";
import { Check } from "lucide-react";
import type { WizardStep } from "@/features/import/wizardState";
import { activeDisplayStep, WIZARD_DISPLAY_STEPS } from "@/features/import/wizardSteps";
import { cn } from "@/lib/utils";

type StepState = "complete" | "current" | "upcoming";

function stateFor(index: number, active: number): StepState {
  if (index < active) return "complete";
  if (index === active) return "current";
  return "upcoming";
}

// The horizontal progress header for the import wizard (Upload -> Map columns -> Preview ->
// Import). Completed steps show a check, the current step a filled numbered circle, upcoming
// steps a muted outline. Mirrors Pipedrive's stepper so users always know where they are.
export function WizardStepper({ step }: { step: WizardStep }): React.ReactNode {
  const active = activeDisplayStep(step);
  return (
    <ol className="flex items-center gap-1 text-sm">
      {WIZARD_DISPLAY_STEPS.map((s, i) => {
        const stepState = stateFor(i, active);
        return (
          <li
            key={s.key}
            data-state={stepState}
            aria-current={stepState === "current" ? "step" : undefined}
            className="flex items-center gap-1"
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors",
                  stepState === "complete" && "bg-primary text-primary-foreground",
                  stepState === "current" && "bg-primary text-primary-foreground",
                  stepState === "upcoming" && "border border-border bg-card text-muted-foreground",
                )}
              >
                {stepState === "complete" ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  "whitespace-nowrap font-medium",
                  stepState === "upcoming" ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {s.label}
              </span>
            </div>
            {i < WIZARD_DISPLAY_STEPS.length - 1 && (
              <span
                aria-hidden
                className={cn("mx-2 h-px w-8 sm:w-12", i < active ? "bg-primary" : "bg-border")}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
