"use client";
import type { LabelTarget } from "@/constants/labelColors";
import { trpc } from "@/lib/trpc-client";
import { buildLabelColorIndex, resolveLabelColorsWith } from "./resolveLabels";

// Hook for surfaces that paint solid-hex label chips (the deal board cards). Loads the catalog for
// the target once (React Query dedupes across cards) and returns a resolver mapping a record's
// stored label names to { name, color: hex }, sourced from the user-managed catalog.
export function useLabelColorResolver(
  target: LabelTarget,
): (keys: string[] | undefined) => Array<{ name: string; color: string }> {
  const catalog = trpc.labels.listByTarget.useQuery({ target }).data ?? [];
  // Build the color index once per catalog, not once per card: the returned resolver runs for
  // every board card, so rebuilding the map inside it was O(cards * catalog) per render.
  const index = buildLabelColorIndex(catalog);
  return (keys) => resolveLabelColorsWith(index, keys ?? []);
}
