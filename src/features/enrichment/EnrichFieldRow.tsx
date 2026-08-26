"use client";
import type React from "react";
import { useId } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/RadioGroup";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import type { ProposedField, ProposedValue } from "./types";

const S = ENRICHMENT_STRINGS.dialog;

export interface EnrichFieldRowProps {
  field: ProposedField;
  checked: boolean;
  // Kept as a string because that is what RadioGroup speaks; the dialog maps it back to the
  // provider's original string-or-number before building a Selection.
  selectedValue: string;
  // Set targets only: whether this value takes the promotion from the one the record holds.
  makePrimary: boolean;
  onCheckedChange: (checked: boolean) => void;
  onValueChange: (value: string) => void;
  onMakePrimaryChange: (makePrimary: boolean) => void;
}

const PRIMARY_CHOICE = { alongside: "alongside", primary: "primary" } as const;

function providersOf(value: ProposedValue): string {
  return value.providers.join(", ");
}

function SingleValue({ value }: { value: ProposedValue }): React.ReactNode {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <span className="text-sm text-foreground">{String(value.value)}</span>
      <span className="text-xs text-muted-foreground">{providersOf(value)}</span>
    </div>
  );
}

// The value text is the click target, not the dot beside it, so the label owns the association.
function ContestedOption({ value }: { value: ProposedValue }): React.ReactNode {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <RadioGroupItem id={id} value={String(value.value)} />
      <label htmlFor={id} className="text-sm text-foreground">
        {String(value.value)}
      </label>
      <span className="text-xs text-muted-foreground">{providersOf(value)}</span>
    </div>
  );
}

function ContestedValues({
  values,
  selectedValue,
  onValueChange,
}: {
  values: ProposedValue[];
  selectedValue: string;
  onValueChange: (value: string) => void;
}): React.ReactNode {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{S.pickOne}</span>
      <RadioGroup value={selectedValue} onValueChange={onValueChange} className="gap-1">
        {values.map((value) => (
          <ContestedOption key={String(value.value)} value={value} />
        ))}
      </RadioGroup>
    </div>
  );
}

// Where an added value sits among the ones the record already holds. Only a set target has a
// promotion to give, and nothing is promoted unless the user says so on this control.
function PrimaryChoice({
  makePrimary,
  onMakePrimaryChange,
}: {
  makePrimary: boolean;
  onMakePrimaryChange: (makePrimary: boolean) => void;
}): React.ReactNode {
  const alongsideId = useId();
  const primaryId = useId();
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{S.primaryChoiceLabel}</span>
      <RadioGroup
        value={makePrimary ? PRIMARY_CHOICE.primary : PRIMARY_CHOICE.alongside}
        onValueChange={(value) => onMakePrimaryChange(value === PRIMARY_CHOICE.primary)}
        className="gap-1"
      >
        {/* The words are the obvious click target, and the dot is a few pixels wide. On a row that
            opens on the promotion, text that does nothing means clicking "add alongside" to opt
            out still submits a promotion. */}
        <div className="flex items-center gap-2">
          <RadioGroupItem id={alongsideId} value={PRIMARY_CHOICE.alongside} />
          <label htmlFor={alongsideId} className="text-sm text-foreground">
            {S.addAlongside}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem id={primaryId} value={PRIMARY_CHOICE.primary} />
          <label htmlFor={primaryId} className="text-sm text-foreground">
            {S.addAsPrimary}
          </label>
        </div>
      </RadioGroup>
    </div>
  );
}

// One reviewable proposal. The checkbox decides whether the field is written at all; the radio
// group only decides which variant is written when the providers disagreed.
export function EnrichFieldRow({
  field,
  checked,
  selectedValue,
  makePrimary,
  onCheckedChange,
  onValueChange,
  onMakePrimaryChange,
}: EnrichFieldRowProps): React.ReactNode {
  const checkboxId = useId();
  const first = field.values[0];
  return (
    <div className="grid grid-cols-[auto_8rem_1fr] items-start gap-x-3 gap-y-1 py-2">
      <Checkbox
        id={checkboxId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        label={field.label}
        className="mt-0.5"
      />
      <label htmlFor={checkboxId} className="text-sm text-muted-foreground">
        {field.label}
      </label>
      <div className="flex flex-col gap-1">
        {field.values.length > 1 ? (
          <ContestedValues
            values={field.values}
            selectedValue={selectedValue}
            onValueChange={onValueChange}
          />
        ) : first !== undefined ? (
          <SingleValue value={first} />
        ) : null}
        {field.isOverwrite ? (
          <span className="text-xs text-muted-foreground">
            {field.currentValue === null
              ? S.overwritesHidden
              : S.overwrites(String(field.currentValue))}
          </span>
        ) : null}
        {field.currentInvalid && field.currentValue !== null ? (
          <span className="text-xs text-muted-foreground">
            {S.currentInvalid(String(field.currentValue))}
          </span>
        ) : null}
        {field.supportsPrimary ? (
          <PrimaryChoice makePrimary={makePrimary} onMakePrimaryChange={onMakePrimaryChange} />
        ) : null}
      </div>
    </div>
  );
}
