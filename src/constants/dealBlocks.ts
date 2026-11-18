export const DEAL_BLOCKS = [
  { id: "summary", name: "Summary" },
  { id: "details", name: "Details" },
  { id: "person", name: "Person" },
  { id: "organization", name: "Organization" },
  { id: "timeline", name: "Timeline" },
  { id: "email", name: "Email" },
] as const;

export type DealBlockId = (typeof DEAL_BLOCKS)[number]["id"];
export const DEAL_BLOCK_IDS = DEAL_BLOCKS.map((b) => b.id);

export function isDealBlockId(v: string): v is DealBlockId {
  return DEAL_BLOCK_IDS.includes(v as DealBlockId);
}
