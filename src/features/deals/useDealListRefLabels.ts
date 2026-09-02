"use client";

import { useState } from "react";
import {
  type CustomFieldRefLabels,
  EMPTY_REF_LABELS,
} from "@/features/custom-fields/refLabelsShared";

export function useDealListRefLabels(
  seed: CustomFieldRefLabels | undefined,
  fromQuery: CustomFieldRefLabels | undefined,
  isPlaceholderData: boolean,
): CustomFieldRefLabels {
  const [labels, setLabels] = useState<CustomFieldRefLabels>(
    fromQuery !== undefined && !isPlaceholderData ? fromQuery : (seed ?? EMPTY_REF_LABELS),
  );
  const [seenFromQuery, setSeenFromQuery] = useState(fromQuery);
  if (fromQuery !== seenFromQuery) {
    setSeenFromQuery(fromQuery);
    if (fromQuery !== undefined && !isPlaceholderData) {
      setLabels(fromQuery);
    }
  }
  return labels;
}
