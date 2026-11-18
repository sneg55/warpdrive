"use client";
import type { LabelTarget } from "@/constants/labelColors";
import { trpc } from "@/lib/trpc-client";
import { buildLabelColorIndex, type ResolvedLabel, resolveLabelChipsWith } from "./resolveLabels";

export function useLabelChipResolver(
  target: LabelTarget,
): (keys: string[] | undefined) => ResolvedLabel[] {
  const catalog = trpc.labels.listByTarget.useQuery({ target }).data ?? [];
  const index = buildLabelColorIndex(catalog);
  return (keys) => resolveLabelChipsWith(index, keys ?? []);
}
