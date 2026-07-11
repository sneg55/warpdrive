// Pure helpers for the board's owner filter (the dropdown that replaces the Everyone/My toggle).
// The board already carries ownerId + ownerName on every card, so the distinct owner set and the
// per-owner narrowing are derived client-side from the loaded cards.

const UNKNOWN_OWNER = "Unknown";

export interface BoardOwner {
  ownerId: string;
  name: string;
}

interface OwnedCard {
  ownerId: string;
  ownerName?: string | null;
}

// Each distinct owner present on the board, once, sorted by display name.
export function distinctBoardOwners(cards: readonly OwnedCard[]): BoardOwner[] {
  const byId = new Map<string, string>();
  for (const c of cards) {
    if (!byId.has(c.ownerId)) {
      byId.set(c.ownerId, c.ownerName ?? UNKNOWN_OWNER);
    }
  }
  return [...byId.entries()]
    .map(([ownerId, name]) => ({ ownerId, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// True when the card should be shown for the selected owner. null selection means Everyone.
export function matchesOwnerFilter(card: OwnedCard, selectedOwnerId: string | null): boolean {
  return selectedOwnerId === null || card.ownerId === selectedOwnerId;
}
