"use client";
import type { Dispatch } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/RadioGroup";
import { Select, type SelectOption } from "@/components/ui/Select";
import { isImportFieldHidden } from "@/constants/builtinFields";
import { STRINGS } from "@/constants/strings";
import {
  ENTITY_FIELDS,
  ENTITY_LABELS,
  type MappableEntity,
  primaryEntityOf,
  TARGET_ENTITY_GROUPS,
} from "@/features/import/importFields";
import { sampleValues } from "@/features/import/sampleValues";
import {
  type ColumnChoice,
  type ImportTarget,
  isMappingComplete,
  type WizardAction,
  type WizardState,
} from "@/features/import/wizardState";
import type { CustomFieldDef } from "@/types/customFields";

const IMP = STRINGS.settings.importer;
const REQUIRED_MARKER = " *";
const UNMAPPED_SELECT_VALUE = "mapping:unmapped";

// Encode a choice as a select value: "" unmapped, "s:<entity>:<field>" standard, "c:<key>" custom.
// The entity has to ride along: Organization > Name and Person > Name are different destinations
// that would otherwise collide on the same "s:name" value.
function choiceToValue(choice: ColumnChoice): string {
  if (choice.isCustom && choice.key !== "") return `c:${choice.key}`;
  if (choice.field !== "") return `s:${choice.entity}:${choice.field}`;
  return "";
}

function valueToChoice(value: string, target: ImportTarget): ColumnChoice {
  const primary = primaryEntityOf(target);
  if (value.startsWith("s:")) {
    const [entity, ...rest] = value.slice(2).split(":");
    return { entity: entity as MappableEntity, field: rest.join(":"), isCustom: false, key: "" };
  }
  // Only the target's own custom-field defs are offered, so a custom column is always primary.
  if (value.startsWith("c:")) {
    return { entity: primary, field: "", isCustom: true, key: value.slice(2) };
  }
  return { entity: primary, field: "", isCustom: false, key: "" };
}

// One grouped picker over every entity this target's row may write: Lead fields, then Organization
// fields, then Note. Only the primary entity's fields carry the required marker; a related group
// is optional until one of its cells is filled, and its own required field (Organization > Name)
// is enforced at validate time.
const EMPTY_HIDDEN: ReadonlySet<string> = new Set();

// Hidden built-in fields per entity (settings > Data fields). Entities without a set (lead, note)
// have no built-in-field management, so they are never gated.
export type HiddenBuiltinsMap = Partial<Record<MappableEntity, ReadonlySet<string>>>;

export function buildColumnOptions(
  target: ImportTarget,
  defs: CustomFieldDef[],
  hidden: HiddenBuiltinsMap = {},
): SelectOption[] {
  const primary = primaryEntityOf(target);
  const options: SelectOption[] = [{ value: UNMAPPED_SELECT_VALUE, label: IMP.unmapped }];
  for (const entity of TARGET_ENTITY_GROUPS[target]) {
    const hiddenForEntity = hidden[entity] ?? EMPTY_HIDDEN;
    for (const field of ENTITY_FIELDS[entity]) {
      const required = entity === primary && field.required;
      // A hidden built-in is dropped from the picker, EXCEPT a required primary field, which must
      // always be mappable (locked identity fields cannot be hidden, so this is defensive).
      if (!required && isImportFieldHidden(field.field, hiddenForEntity)) continue;
      options.push({
        value: `s:${entity}:${field.field}`,
        label: `${field.label}${required ? REQUIRED_MARKER : ""}`,
        group: ENTITY_LABELS[entity],
      });
    }
  }
  for (const def of defs) {
    options.push({ value: `c:${def.key}`, label: def.name, group: IMP.customGroup });
  }
  return options;
}

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
  const complete = isMappingComplete(state);
  const columnOptions = buildColumnOptions(state.target, defs, hiddenBuiltins);
  // Dedup applies to the record a row MATCHES on. Leads have no natural dedup key and always
  // create, so the control would do nothing there.
  const showDedup = state.target === "person" || state.target === "organization";
  // Notes attach to deal/person/organization/lead, never to activities.
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
                  {/* Sample values legitimately repeat (a boolean column reads "False" twice), so
                      the value is not a unique key. This list is derived read-only from a frozen
                      slice: it never reorders, never grows, and holds no component state. */}
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
