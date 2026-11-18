"use client";
import type { SectionHeaderMenuItem } from "@/features/deal-workspace/sidebar/SectionHeaderMenu";

export function customizeFieldsItem(
  push: (href: string) => void,
  entity: "person" | "organization",
  label: string,
): SectionHeaderMenuItem {
  return { label, onSelect: () => push(`/settings/fields?entity=${entity}`) };
}
