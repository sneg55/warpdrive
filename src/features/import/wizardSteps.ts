// The user-visible stepper for the import wizard. The reducer runs 6 internal states
// (upload -> preparing -> map -> validating -> preview -> commit), but two of those are
// transient background phases; the header only ever shows the 4 steps a user acts on.
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

// Which display step the wizard is currently on. preparing folds into Upload (we are still
// processing the just-uploaded file) and validating folds into Map columns (it is the map
// step's Continue doing its background work), so the stepper never lands on an invisible state.
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
