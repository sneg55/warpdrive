"use client";
import type { SectionHeaderMenuItem } from "@/features/deal-workspace/sidebar/SectionHeaderMenu";

// Contact sidebars reuse the generic sectionHeaderActions builder (pencil reveals empty fields,
// kebab lists menu items). Re-exported under the contact name so PersonSidebar/OrgSidebar read
// intent-first.
export { sectionHeaderActions as contactSectionActions } from "@/features/deal-workspace/sidebar/sectionActions";

// Convenience: the "Customize fields" kebab item routing to the field settings for an entity.
export function customizeFieldsItem(
  push: (href: string) => void,
  entity: "person" | "organization",
  label: string,
): SectionHeaderMenuItem {
  return { label, onSelect: () => push(`/settings/fields?entity=${entity}`) };
}
