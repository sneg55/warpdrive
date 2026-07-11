/**
 * scripts/seed-demo-pools.ts
 *
 * Deterministic PRNG, bounds-checked helpers, static word pools, seed types, and
 * small value generators shared by the demo generators in seed-demo-data.ts.
 * No DB access. Kept separate to keep each file focused and under the size cap.
 */

// mulberry32: tiny deterministic PRNG so the demo dataset is reproducible.
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;
// Bounds-checked accessor: the lint config bans non-null assertions, so index
// access (with noUncheckedIndexedAccess on) is narrowed through this helper.
export function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`index ${i} out of range (len ${arr.length})`);
  return v;
}
export const pick = <T>(rng: Rng, arr: readonly T[]): T => at(arr, Math.floor(rng() * arr.length));
export const randInt = (rng: Rng, lo: number, hi: number): number =>
  lo + Math.floor(rng() * (hi - lo + 1));
export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

export const ADJ = [
  "North",
  "Blue",
  "Summit",
  "Bright",
  "Iron",
  "Cedar",
  "Vertex",
  "Orbit",
  "Pioneer",
  "Coastal",
  "Granite",
  "Nimbus",
  "Apex",
  "Harbor",
  "Silver",
  "Union",
] as const;
export const NOUN = [
  "Systems",
  "Labs",
  "Dynamics",
  "Networks",
  "Analytics",
  "Logistics",
  "Robotics",
  "Ventures",
  "Digital",
  "Foundry",
  "Health",
  "Energy",
  "Retail",
  "Capital",
] as const;
export const FIRST = [
  "Ava",
  "Liam",
  "Mia",
  "Noah",
  "Emma",
  "Ethan",
  "Olivia",
  "Lucas",
  "Sofia",
  "Mason",
  "Isla",
  "Leo",
  "Aria",
  "Kai",
  "Zoe",
  "Ravi",
  "Nina",
  "Omar",
  "Elena",
  "Jonas",
] as const;
export const LAST = [
  "Carter",
  "Nguyen",
  "Patel",
  "Kim",
  "Silva",
  "Okafor",
  "Rossi",
  "Haas",
  "Moreno",
  "Fischer",
  "Novak",
  "Reyes",
  "Dubois",
  "Ivanov",
  "Costa",
  "Adler",
  "Bauer",
  "Cohen",
] as const;
export const CITIES = [
  "Austin",
  "Denver",
  "Berlin",
  "Toronto",
  "Lisbon",
  "Boston",
  "Sydney",
] as const;
export const DEAL_NOUN = [
  "renewal",
  "expansion",
  "new license",
  "pilot",
  "upgrade",
  "enterprise plan",
  "annual contract",
  "onboarding",
  "POC",
  "support package",
] as const;
export const LEAD_SRC = ["web_form", "manually_created", "import", "referral", "outbound"] as const;
export const INDUSTRIES = ["SaaS", "Fintech", "Healthcare", "Retail", "Manufacturing", "Media"];
export const DEAL_SOURCES = ["Inbound", "Outbound", "Referral", "Event", "Partner"];
export const PHONE_LABELS = ["work", "mobile"] as const;
// Firmographic pools for organization enrichment (Wave 3, migration 0037).
export const ORG_SIZES = [8, 24, 60, 140, 380, 900, 2400, 5200] as const;
// Free-text relation labels for organization_relations (Wave 3, Task 23).
export const ORG_RELATION_TYPES = [
  "Partner",
  "Subsidiary",
  "Parent company",
  "Vendor",
  "Customer",
] as const;

export type Visibility = "all" | "owner" | "group";
export type ContactPoint = { label: string; value: string; primary: boolean };

export type OrgSeed = {
  name: string;
  domain: string;
  city: string;
  // Firmographics (migration 0037): populated for ~85% of orgs, null for the rest
  // so the org panel exercises both filled and empty states.
  industry: string | null;
  employeeCount: number | null;
  annualRevenue: string | null;
  linkedinUrl: string | null;
  ownerId: string;
  visibility: Visibility;
};
export type PersonSeed = {
  name: string;
  email: string;
  emails: ContactPoint[];
  phones: ContactPoint[];
  orgIdx: number | null;
  ownerId: string;
  visibility: Visibility;
};
export type DealSeed = {
  title: string;
  status: "open" | "won" | "lost";
  value: string | null;
  probability: number | null;
  expectedCloseDate: string | null;
  customFields: Record<string, string>;
  visibility: Visibility;
  stageEnteredDaysAgo: number;
  stageIdx: number;
  ownerId: string;
  orgIdx: number;
  personIdx: number;
};
export type LeadSeed = {
  title: string;
  value: string | null;
  ownerId: string;
  sourceOrigin: string;
  archived: boolean;
  personIdx: number | null;
  orgIdx: number | null;
  convert: boolean;
};

// Visibility mix: mostly shared, with a minority owner-only / group-scoped so the
// demo exercises trust-boundary filtering when logged in as a regular rep.
export function visibilityFor(rng: Rng): Visibility {
  const r = rng();
  return r < 0.7 ? "all" : r < 0.85 ? "owner" : "group";
}

export function phone(rng: Rng): string {
  return `+1-555-${randInt(rng, 100, 999)}-${randInt(rng, 1000, 9999)}`;
}

// YYYY-MM-DD `days` from today (negative = past). Uses UTC to stay deterministic.
export function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

// ~65% of deals have an expected close date: a spread of overdue, imminent, later.
export function expectedClose(rng: Rng): string | null {
  if (rng() < 0.35) return null;
  const r = rng();
  if (r < 0.3) return isoDaysFromNow(-randInt(rng, 1, 30));
  if (r < 0.65) return isoDaysFromNow(randInt(rng, 1, 14));
  return isoDaysFromNow(randInt(rng, 15, 90));
}
