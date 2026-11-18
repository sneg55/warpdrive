"use client";
import type { Dispatch } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/RadioGroup";
import { Select } from "@/components/ui/Select";
import { STRINGS } from "@/constants/strings";
import type { HiddenBuiltinsMap } from "@/features/import/eligibleFields";
import { sampleValues } from "@/features/import/sampleValues";
import {
  isMappingComplete,
  type WizardAction,
  type WizardState,
} from "@/features/import/wizardState";
import type { CustomFieldDef } from "@/types/customFields";
import {
  buildColumnOptions,
  choiceToValue,
  UNMAPPED_SELECT_VALUE,
  valueToChoice,
} from "./columnOptions";
import { StageOptions } from "./StageOptions";

export type { HiddenBuiltinsMap };
export { buildColumnOptions };

const IMP = STRINGS.settings.importer;

export interface MapStepProps {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
  defs: CustomFieldDef[];
  hiddenBuiltins?: HiddenBuiltinsMap;
  busy: boolean;
  onContinue: () => void;
}

export function MapStep({
  state,
  dispatch,
  defs,
  hiddenBuiltins = {},
  busy,
  onContinue,
}: MapStepProps): React.ReactNode {
  const complete = isMappingComplete(state, state.source);
  const columnOptions = buildColumnOptions(state.target, defs, hiddenBuiltins, state.source);
  const showDedup = state.target === "person" || state.target === "organization";
  const canRowNote = state.target !== "activity";

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">{IMP.column}</th>
              <th className="px-3 py-2">{IMP.mapTo}</th>
            </tr>
          </thead>
          <tbody>
            {state.headers.map((header) => (
              <tr key={header} className="border-t first:border-t-0">
                <td className="px-3 py-2 align-middle">
                  <span className="font-medium">{header}</span>
                  {sampleValues(state.rows, header).map((value, i) => (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: static, never-reordered list
                      key={`${header}-${i}`}
                      className="mt-0.5 block truncate text-xs text-muted-foreground"
                    >
                      {value}
                    </span>
                  ))}
                </td>
                <td className="px-3 py-2">
                  <Select
                    ariaLabel={`${IMP.mapTo}: ${header}`}
                    value={choiceToValue(state.columns[header] ?? valueToChoice("", state.target))}
                    onChange={(value) =>
                      dispatch({
                        type: "setColumn",
                        header,
                        choice: valueToChoice(
                          value === UNMAPPED_SELECT_VALUE ? "" : value,
                          state.target,
                        ),
                      })
                    }
                    placeholder={IMP.unmapped}
                    options={columnOptions}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showDedup && (
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-sm font-medium">{IMP.dedup}</legend>
          <RadioGroup
            value={state.dedupMode}
            onValueChange={(v) => dispatch({ type: "setDedup", dedupMode: v as "skip" | "update" })}
            aria-label={IMP.dedup}
            className="gap-1.5"
          >
            {(["skip", "update"] as const).map((mode) => (
              <div key={mode} className="flex items-center gap-2 text-sm">
                <RadioGroupItem value={mode} id={`dedup-${mode}`} />
                <label htmlFor={`dedup-${mode}`} className="cursor-pointer">
                  {mode === "skip" ? IMP.dedupSkip : IMP.dedupUpdate}
                </label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>
      )}

      {state.source === "pipedrive" && state.target === "deal" && (
        <StageOptions
          checked={state.createMissingStages}
          onChange={(createMissingStages) =>
            dispatch({ type: "setCreateMissingStages", createMissingStages })
          }
        />
      )}

      {canRowNote && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Checkbox
              id="row-note"
              checked={state.rowNoteFromUnmapped}
              onCheckedChange={(checked) =>
                dispatch({ type: "setRowNote", rowNoteFromUnmapped: checked })
              }
              label={IMP.rowNote}
            />
            <label htmlFor="row-note" className="cursor-pointer text-sm font-medium">
              {IMP.rowNote}
            </label>
          </div>
          <p className="text-xs text-muted-foreground">{IMP.rowNoteHint}</p>
        </div>
      )}

      {!complete && <p className="text-sm text-amber-600">{IMP.nameRequired}</p>}
      <Button type="button" disabled={!complete || busy} onClick={onContinue} size="sm">
        {IMP.continue}
      </Button>
    </section>
  );
}
