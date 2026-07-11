"use client";
import { useReducer, useState } from "react";
import { STRINGS } from "@/constants/strings";
import { commitBatchAction, setMappingAction } from "@/features/import/actions";
import type { MappableEntity } from "@/features/import/importFields";
import {
  buildColumnMapping,
  type ImportTarget,
  initialWizardState,
  wizardReducer,
} from "@/features/import/wizardState";
import type { CustomFieldDef } from "@/types/customFields";
import { assertNever } from "@/types/result";
import { readCsrfToken } from "@/utils/csrfCookie";
import { CommitStep } from "./CommitStep";
import { type HiddenBuiltinsMap, MapStep } from "./MapStep";
import { PhaseWait } from "./PhaseWait";
import { PreviewStep } from "./PreviewStep";
import { UploadStep } from "./UploadStep";
import { WizardStepper } from "./WizardStepper";

const IMP = STRINGS.settings.importer;

export interface ImportWizardProps {
  personDefs: CustomFieldDef[];
  orgDefs: CustomFieldDef[];
  dealDefs: CustomFieldDef[];
  activityDefs: CustomFieldDef[];
  // Hidden built-in fields per entity (settings > Data fields). Arrays over the wire; the map step
  // turns them into Sets. Optional so callers/tests without the data still render every field.
  hiddenBuiltins?: Partial<Record<MappableEntity, readonly string[]>>;
}

// Per-target custom-field defs for the map step. Lead has no entry: CUSTOM_FIELD_TARGETS
// has no "lead" (leads.customFields does not exist), so it always offers none.
function defsForTarget(props: ImportWizardProps, target: ImportTarget): CustomFieldDef[] {
  switch (target) {
    case "person":
      return props.personDefs;
    case "organization":
      return props.orgDefs;
    case "deal":
      return props.dealDefs;
    case "activity":
      return props.activityDefs;
    case "lead":
      return [];
    default:
      return assertNever(target);
  }
}

export function ImportWizard(props: ImportWizardProps): React.ReactNode {
  const [state, dispatch] = useReducer(wizardReducer, undefined, initialWizardState);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const defs = defsForTarget(props, state.target);
  const hiddenBuiltins: HiddenBuiltinsMap = Object.fromEntries(
    Object.entries(props.hiddenBuiltins ?? {}).map(([entity, keys]) => [
      entity as MappableEntity,
      new Set(keys),
    ]),
  );

  // Persist the mapping then hand off to the background validate job; the wizard waits on
  // the "validating" step for the batch to reach "ready".
  async function saveAndValidate(): Promise<void> {
    if (state.batchId === null) return;
    setBusy(true);
    setError(null);
    const m = await setMappingAction(
      { batchId: state.batchId, mapping: buildColumnMapping(state) },
      readCsrfToken(),
    );
    setBusy(false);
    if (m.ok === false) {
      setError(m.error.id);
      return;
    }
    dispatch({ type: "goto", step: "validating" });
  }

  // Enqueue the background commit job; the commit step follows progress and reads the split.
  async function commit(): Promise<void> {
    if (state.batchId === null) return;
    setBusy(true);
    setError(null);
    const r = await commitBatchAction({ batchId: state.batchId }, readCsrfToken());
    setBusy(false);
    if (r.ok === false) {
      setError(r.error.id);
      return;
    }
    dispatch({ type: "goto", step: "commit" });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{IMP.title}</h1>
        <p className="text-sm text-muted-foreground">{IMP.subtitle}</p>
      </div>

      <WizardStepper step={state.step} />

      {error !== null && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {IMP.errorGeneric}
        </p>
      )}

      <div className="rounded-lg border bg-card p-5 sm:p-6">
        {state.step === "upload" && (
          <UploadStep state={state} dispatch={dispatch} busy={busy} onError={setError} />
        )}
        {state.step === "preparing" && state.batchId !== null && (
          <PhaseWait
            batchId={state.batchId}
            until="mapping_ready"
            label={IMP.importing}
            onReady={(b) => {
              if (b.headers !== null) {
                dispatch({
                  type: "prepared",
                  headers: b.headers,
                  totalRows: b.totalRows,
                  previewRows: b.previewRows ?? [],
                });
              }
            }}
            onError={setError}
          />
        )}
        {state.step === "map" && (
          <MapStep
            state={state}
            dispatch={dispatch}
            defs={defs}
            hiddenBuiltins={hiddenBuiltins}
            busy={busy}
            onContinue={() => void saveAndValidate()}
          />
        )}
        {state.step === "validating" && state.batchId !== null && (
          <PhaseWait
            batchId={state.batchId}
            until="ready"
            label={IMP.importing}
            onReady={(b) =>
              dispatch({
                type: "validated",
                validation: { valid: b.validRows, invalid: b.errorRows },
              })
            }
            onError={setError}
          />
        )}
        {state.step === "preview" && state.batchId !== null && state.validation !== null && (
          <PreviewStep
            batchId={state.batchId}
            validation={state.validation}
            busy={busy}
            onCommit={() => void commit()}
          />
        )}
        {state.step === "commit" && state.batchId !== null && (
          <CommitStep batchId={state.batchId} onReset={() => dispatch({ type: "reset" })} />
        )}
      </div>
    </div>
  );
}
