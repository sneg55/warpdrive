"use client";
import type React from "react";
import { createContext, useContext } from "react";
import { type CustomFieldRefLabels, EMPTY_REF_LABELS, mergeRefLabels } from "./refLabelsShared";

export { type CustomFieldRefLabels, EMPTY_REF_LABELS, mergeRefLabels };

const Ctx = createContext<CustomFieldRefLabels>(EMPTY_REF_LABELS);

export function CustomFieldRefLabelsProvider({
  value,
  children,
}: {
  value: CustomFieldRefLabels;
  children: React.ReactNode;
}): React.ReactNode {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCustomFieldRefLabels(): CustomFieldRefLabels {
  return useContext(Ctx);
}
