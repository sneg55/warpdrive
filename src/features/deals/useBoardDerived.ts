import { useMemo } from "react";
import { applyConditions } from "./boardConditions";
import { distinctBoardOwners, matchesOwnerFilter } from "./boardFilter";
import type { Condition } from "./boardQuickFilter";
import type { BoardSortKey, SortDirection } from "./boardSort";
import { sortBoardCards } from "./boardSort";
import type { StageMeta } from "./boardTypes";
import type { BoardCard } from "./dealRepo";

interface DerivedInput {
  liveCards: BoardCard[];
  stages: StageMeta[];
  selectedOwnerId: string | null;
  conditions: Condition[];
  sortKey: BoardSortKey;
  sortDirection: SortDirection;
}

interface Derived {
  owners: ReturnType<typeof distinctBoardOwners>;
  shownCards: BoardCard[];
  sumsByStage: Map<string, { dealCount: number; total: number }>;
  boardTotal: number;
  sortedByStage: Map<string, BoardCard[]>;
}

// Board display derivations, all downstream of the client-side owner/saved-filter/quick-condition
// narrowing. Drag math reads the raw liveCards, not these, so filtering/sorting is display-only.
export function useBoardDerived(input: DerivedInput): Derived {
  const { liveCards, stages, selectedOwnerId, conditions, sortKey, sortDirection } = input;

  const owners = useMemo(() => distinctBoardOwners(liveCards), [liveCards]);

  const shownCards = useMemo(() => {
    const base = liveCards.filter((c) => matchesOwnerFilter(c, selectedOwnerId));
    return applyConditions(base, conditions);
  }, [liveCards, selectedOwnerId, conditions]);

  const sumsByStage = useMemo(() => {
    const m = new Map<string, { dealCount: number; total: number }>();
    for (const c of shownCards) {
      const cur = m.get(c.stageId) ?? { dealCount: 0, total: 0 };
      m.set(c.stageId, {
        dealCount: cur.dealCount + 1,
        total: cur.total + (c.value !== null ? Number(c.value) : 0),
      });
    }
    return m;
  }, [shownCards]);

  const boardTotal = useMemo(
    () => shownCards.reduce((s, c) => s + (c.value !== null ? Number(c.value) : 0), 0),
    [shownCards],
  );

  const sortedByStage = useMemo(() => {
    const buckets = new Map<string, BoardCard[]>(stages.map((s) => [s.id, []]));
    for (const c of shownCards) buckets.get(c.stageId)?.push(c);
    for (const s of stages) {
      buckets.set(s.id, sortBoardCards(buckets.get(s.id) ?? [], sortKey, sortDirection));
    }
    return buckets;
  }, [stages, shownCards, sortKey, sortDirection]);

  return { owners, shownCards, sumsByStage, boardTotal, sortedByStage };
}
