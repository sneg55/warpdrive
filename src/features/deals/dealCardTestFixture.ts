import type { BoardCard } from "./dealRepo";

// Shared fixture for DealCard tests. Kept out of the *.test.tsx file so the test
// module stays under the file-size limit.
export const baseCard: BoardCard = {
  id: "d1",
  title: "Acme renewal",
  value: "25000.00",
  stageId: "s1",
  boardPosition: "1",
  ownerId: "u1",
  personId: "p1",
  orgId: "o1",
  nextActivityAt: null,
  lastActivityAt: null,
  stageEnteredAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
};
