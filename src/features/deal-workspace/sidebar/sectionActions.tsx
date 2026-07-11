"use client";
import type React from "react";
import { SectionHeaderMenu, type SectionHeaderMenuItem } from "./SectionHeaderMenu";

// Generic headerActions builder for a CollapsibleSection (contact + lead sidebars). Renders only
// the kebab (section menu items). No pencil: on these sidebars the "Edit {section}" pencil only
// re-showed funnel-hidden fields (a duplicate of the hide-empty funnel toggle) while its label
// implied a section edit mode that does not exist, so it read as a dead control. Field editing is
// via inline field-click or the header Edit button; the funnel still toggles empties.
export function sectionHeaderActions(
  label: string,
  menuItems: SectionHeaderMenuItem[],
): (ctx: { hideEmpty: boolean; showEmptyFields: () => void }) => React.ReactNode {
  return () => <SectionHeaderMenu sectionLabel={label} menuItems={menuItems} />;
}
