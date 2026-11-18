const UNKNOWN_OWNER = "Unknown";

export interface BoardOwner {
  ownerId: string;
  name: string;
}

interface OwnedCard {
  ownerId: string;
  ownerName?: string | null;
}

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

export function matchesOwnerFilter(card: OwnedCard, selectedOwnerId: string | null): boolean {
  return selectedOwnerId === null || card.ownerId === selectedOwnerId;
}
