"use client";
import { useMemo, useState } from "react";
import type { SearchResult, SearchResults } from "@/types/search";

type ResultKind = "deal" | "person" | "organization" | "lead";

export interface FlatResult {
  kind: ResultKind;
  r: SearchResult;
}

export function useActiveIndex(results: SearchResults): {
  flat: FlatResult[];
  active: number;
  moveDown: () => void;
  moveUp: () => void;
} {
  const flat = useMemo<FlatResult[]>(
    () => [
      ...results.deals.map((r) => ({ kind: "deal" as const, r })),
      ...results.people.map((r) => ({ kind: "person" as const, r })),
      ...results.organizations.map((r) => ({ kind: "organization" as const, r })),
      ...results.leads.map((r) => ({ kind: "lead" as const, r })),
    ],
    [results],
  );
  const [active, setActive] = useState(0);

  const flatIds = flat.map((f) => f.r.id).join("|");

  const [seenIds, setSeenIds] = useState(flatIds);
  if (seenIds !== flatIds) {
    setSeenIds(flatIds);
    setActive(0);
  }

  function moveDown() {
    setActive((i) => Math.min(i + 1, flat.length - 1));
  }
  function moveUp() {
    setActive((i) => Math.max(i - 1, 0));
  }

  return { flat, active, moveDown, moveUp };
}
