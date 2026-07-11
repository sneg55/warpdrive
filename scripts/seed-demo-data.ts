/**
 * scripts/seed-demo-data.ts
 *
 * Pure record generators for the demo seed. No DB access: every function is
 * deterministic given its inputs (seeded PRNG). Shared PRNG/helpers/pools/types
 * live in seed-demo-pools.ts and are re-exported here so consumers have one import.
 */

import {
  ADJ,
  at,
  CITIES,
  type ContactPoint,
  DEAL_NOUN,
  DEAL_SOURCES,
  type DealSeed,
  expectedClose,
  FIRST,
  INDUSTRIES,
  LAST,
  LEAD_SRC,
  type LeadSeed,
  NOUN,
  ORG_SIZES,
  type OrgSeed,
  type PersonSeed,
  PHONE_LABELS,
  phone,
  pick,
  type Rng,
  randInt,
  slug,
  visibilityFor,
} from "./seed-demo-pools";

export * from "./seed-demo-pools";

export function buildOrgs(rng: Rng, n: number, ownerIds: string[]): OrgSeed[] {
  const used = new Set<string>();
  const out: OrgSeed[] = [];
  let i = 0;
  while (out.length < n) {
    const base = `${ADJ[i % ADJ.length]} ${NOUN[Math.floor(i / ADJ.length) % NOUN.length]}`;
    const name = used.has(base)
      ? `${base} ${Math.floor(i / (ADJ.length * NOUN.length)) + 1}`
      : base;
    i += 1;
    if (used.has(name)) continue;
    used.add(name);
    // ~85% of orgs carry firmographics; the rest stay null to show empty states.
    const enriched = rng() < 0.85;
    out.push({
      name,
      domain: `${slug(name)}.com`,
      city: pick(rng, CITIES),
      industry: enriched ? pick(rng, INDUSTRIES) : null,
      employeeCount: enriched ? pick(rng, ORG_SIZES) : null,
      annualRevenue: enriched ? (randInt(rng, 5, 480) * 100_000).toFixed(2) : null,
      linkedinUrl: enriched ? `https://www.linkedin.com/company/${slug(name)}` : null,
      ownerId: at(ownerIds, out.length % ownerIds.length),
      visibility: visibilityFor(rng),
    });
  }
  return out;
}

export function buildPeople(
  rng: Rng,
  n: number,
  orgs: OrgSeed[],
  ownerIds: string[],
): PersonSeed[] {
  const out: PersonSeed[] = [];
  for (let i = 0; i < n; i += 1) {
    const first = pick(rng, FIRST);
    const last = pick(rng, LAST);
    // ~15% are individual contacts with no organization.
    const orgIdx = rng() < 0.15 ? null : i % orgs.length;
    const domain = orgIdx === null ? "gmail.com" : at(orgs, orgIdx).domain;
    const email = `${slug(first)}.${slug(last)}${i}@${domain}`;
    const emails: ContactPoint[] = [{ label: "work", value: email, primary: true }];
    // ~30% carry a second (personal) email address.
    if (rng() < 0.3) {
      emails.push({
        label: "home",
        value: `${slug(first)}.${slug(last)}${i}@icloud.com`,
        primary: false,
      });
    }
    const phones: ContactPoint[] = [];
    // ~70% have at least one phone; ~25% of those have a second.
    if (rng() < 0.7) {
      phones.push({ label: at(PHONE_LABELS, 0), value: phone(rng), primary: true });
      if (rng() < 0.25)
        phones.push({ label: at(PHONE_LABELS, 1), value: phone(rng), primary: false });
    }
    out.push({
      name: `${first} ${last}`,
      email,
      emails,
      phones,
      orgIdx,
      ownerId: at(ownerIds, i % ownerIds.length),
      visibility: visibilityFor(rng),
    });
  }
  return out;
}

export function buildDeals(
  rng: Rng,
  n: number,
  stageCount: number,
  ownerIds: string[],
  orgCount: number,
  personCount: number,
): DealSeed[] {
  const out: DealSeed[] = [];
  for (let i = 0; i < n; i += 1) {
    const orgIdx = randInt(rng, 0, orgCount - 1);
    const roll = rng();
    const status = roll < 0.6 ? "open" : roll < 0.8 ? "won" : "lost";
    // Open deals may be valueless (~15%); won/lost always carry a value.
    const value =
      status === "open" && rng() < 0.15 ? null : (randInt(rng, 2, 200) * 500).toFixed(2);
    out.push({
      title: `${DEAL_NOUN[i % DEAL_NOUN.length]} deal #${i + 1}`,
      status,
      value,
      // ~25% override the stage's inherited probability.
      probability: rng() < 0.25 ? randInt(rng, 1, 19) * 5 : null,
      expectedCloseDate: expectedClose(rng),
      customFields: { industry: pick(rng, INDUSTRIES), deal_source: pick(rng, DEAL_SOURCES) },
      visibility: visibilityFor(rng),
      // Most deals are fresh; ~30% entered their stage long ago so they show as rotting.
      stageEnteredDaysAgo: rng() < 0.3 ? randInt(rng, 20, 60) : randInt(rng, 0, 6),
      stageIdx: i % stageCount,
      ownerId: at(ownerIds, i % ownerIds.length),
      orgIdx,
      personIdx: randInt(rng, 0, personCount - 1),
    });
  }
  return out;
}

export function buildLeads(
  rng: Rng,
  n: number,
  ownerIds: string[],
  personCount: number,
  orgCount: number,
): LeadSeed[] {
  const out: LeadSeed[] = [];
  for (let i = 0; i < n; i += 1) {
    const archived = rng() < 0.2;
    out.push({
      title: `Inbound lead #${i + 1}`,
      value: rng() < 0.7 ? (randInt(rng, 2, 100) * 500).toFixed(2) : null,
      ownerId: at(ownerIds, i % ownerIds.length),
      sourceOrigin: pick(rng, LEAD_SRC),
      archived,
      // Most leads name a contact; ~65% also an org. ~12% (active only) convert to a deal.
      personIdx: rng() < 0.8 ? randInt(rng, 0, personCount - 1) : null,
      orgIdx: rng() < 0.65 ? randInt(rng, 0, orgCount - 1) : null,
      convert: !archived && rng() < 0.15,
    });
  }
  return out;
}
