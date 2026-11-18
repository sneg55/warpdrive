"use client";
import type React from "react";
import { SectionHeaderMenu, type SectionHeaderMenuItem } from "./SectionHeaderMenu";

export function sectionHeaderActions(
  label: string,
  menuItems: SectionHeaderMenuItem[],
): (ctx: { hideEmpty: boolean; showEmptyFields: () => void }) => React.ReactNode {
  return () => <SectionHeaderMenu sectionLabel={label} menuItems={menuItems} />;
}
