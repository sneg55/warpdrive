"use client";
import type { LabelTarget } from "@/constants/labelColors";
import { trpc } from "@/lib/trpc-client";
import { type ResolvedLabel, resolveLabelChips } from "./resolveLabels";

// Hook for client surfaces that render light class-based label chips (lead list cells, lead
// header/sidebar). Loads the catalog for the target once (React Query dedupes) and returns a
// resolver mapping a record's stored label names to renderable chips.
export function useLabelChipResolver(
  target: LabelTarget,
): (keys: string[] | undefined) => ResolvedLabel[] {
  const catalog = trpc.labels.listByTarget.useQuery({ target }).data ?? [];
  return (keys) => resolveLabelChips(catalog, keys ?? []);
}
