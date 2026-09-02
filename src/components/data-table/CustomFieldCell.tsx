"use client";
import type React from "react";
import { Tip } from "@/components/ui/tooltip";
import { useCustomFieldRefLabels } from "@/features/custom-fields/refLabelsContext";
import { formatCustomFieldDisplay, isCustomFieldValueEmpty } from "@/features/custom-fields/render";
import type { CustomFieldDef } from "@/types/customFields";

export function customFieldCellClass(def: CustomFieldDef): string {
  const numeric = def.type === "numeric" || def.type === "monetary";
  return numeric
    ? "px-3 py-2 tabular-nums text-right text-muted-foreground"
    : "px-3 py-2 text-muted-foreground";
}

export function CustomFieldCell({
  def,
  value,
  currency,
}: {
  def: CustomFieldDef;
  value: unknown;
  currency: string;
}): React.ReactNode {
  const refLabels = useCustomFieldRefLabels();
  if (isCustomFieldValueEmpty(value)) return null;
  const text = formatCustomFieldDisplay(def, value, currency, refLabels);
  return (
    <Tip label={text}>
      <span className="block max-w-[28rem] truncate">{text}</span>
    </Tip>
  );
}
