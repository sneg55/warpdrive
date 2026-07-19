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
// No manual useMemo: React Compiler (enabled repo-wide) memoizes each derivation from its reactive
// inputs, so the hand-written memos were redundant.
export function useBoardDerived(input: DerivedInput): Derived {
  const { liveCards, stages, selectedOwnerId, conditions, sortKey, sortDirection } = input;

  const owners = distinctBoardOwners(liveCards);

  const shownCards = applyConditions(
    liveCards.filter((c) => matchesOwnerFilter(c, selectedOwnerId)),
    conditions,
  );

  const sumsByStage = new Map<string, { dealCount: number; total: number }>();
  for (const c of shownCards) {
    const cur = sumsByStage.get(c.stageId) ?? { dealCount: 0, total: 0 };
    sumsByStage.set(c.stageId, {
      dealCount: cur.dealCount + 1,
      total: cur.total + (c.value !== null ? Number(c.value) : 0),
    });
  }

  const boardTotal = shownCards.reduce((s, c) => s + (c.value !== null ? Number(c.value) : 0), 0);

  const sortedByStage = new Map<string, BoardCard[]>(stages.map((s) => [s.id, []]));
  for (const c of shownCards) sortedByStage.get(c.stageId)?.push(c);
  for (const s of stages) {
    sortedByStage.set(s.id, sortBoardCards(sortedByStage.get(s.id) ?? [], sortKey, sortDirection));
  }

  return { owners, shownCards, sumsByStage, boardTotal, sortedByStage };
}
