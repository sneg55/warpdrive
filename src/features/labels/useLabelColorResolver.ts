"use client";
import type { LabelTarget } from "@/constants/labelColors";
import { trpc } from "@/lib/trpc-client";
import { buildLabelColorIndex, resolveLabelColorsWith } from "./resolveLabels";

export function useLabelColorResolver(
  target: LabelTarget,
): (keys: string[] | undefined) => Array<{ name: string; color: string }> {
  const catalog = trpc.labels.listByTarget.useQuery({ target }).data ?? [];
  const index = buildLabelColorIndex(catalog);
  return (keys) => resolveLabelColorsWith(index, keys ?? []);
}
