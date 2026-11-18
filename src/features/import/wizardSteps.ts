import { IMPORTER_STRINGS } from "@/constants/importerStrings";
import { assertNever } from "@/types/result";
import type { WizardStep } from "./wizardState";

export interface WizardDisplayStep {
  key: "upload" | "map" | "preview" | "commit";
  label: string;
}

export const WIZARD_DISPLAY_STEPS: readonly WizardDisplayStep[] = [
  { key: "upload", label: IMPORTER_STRINGS.stepUpload },
  { key: "map", label: IMPORTER_STRINGS.stepMap },
  { key: "preview", label: IMPORTER_STRINGS.stepPreview },
  { key: "commit", label: IMPORTER_STRINGS.stepCommit },
];

export function activeDisplayStep(step: WizardStep): number {
  switch (step) {
    case "upload":
    case "preparing":
      return 0;
    case "map":
    case "validating":
      return 1;
    case "preview":
      return 2;
    case "commit":
      return 3;
    default:
      return assertNever(step);
  }
}
