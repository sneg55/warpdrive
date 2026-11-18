import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { Organization, Person } from "@/db/schema";
import { customFieldDefs, organizations, persons } from "@/db/schema";
import type { ResolvedMapping } from "./types";

const ADDRESS_PREFIX = "address.";

export interface CurrentValues {
  canonicalValues: Record<string, string | number | null>;
  occupiedKeys: string[];
  multiValues: Record<string, readonly string[]>;
  customFieldKeyById: Map<string, string>;
}

async function customFieldKeys(
  db: Db,
  mappings: readonly ResolvedMapping[],
  signal: AbortSignal,
): Promise<Map<string, string>> {
  signal.throwIfAborted();
  const ids = mappings
    .map((m) => m.targetFieldDefId)
    .filter((id): id is string => id !== null && id.length > 0);
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: customFieldDefs.id, key: customFieldDefs.key })
    .from(customFieldDefs)
    .where(and(inArray(customFieldDefs.id, ids), isNull(customFieldDefs.archivedAt)));
  return new Map(rows.map((r) => [r.id, r.key]));
}

function scalar(value: unknown): string | number | null {
  if (typeof value === "string") return value.length > 0 ? value : null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return null;
}

function personEmails(person: Person): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [person.primaryEmail, ...person.emails.map((point) => point.value)]) {
    const value = raw === null ? "" : raw.trim();
    const key = value.toLowerCase();
    if (value.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

interface TargetState {
  value: string | number | null;
  addresses?: string[];
  occupied?: boolean;
}

function personTarget(
  mapping: ResolvedMapping,
  person: Person,
  linkedOrg: { name: string; domain: string | null } | null,
  custom: Record<string, unknown>,
  customFieldKeyById: ReadonlyMap<string, string>,
): TargetState {
  if (mapping.targetKind === "custom") {
    const fieldKey = customFieldKeyById.get(mapping.targetFieldDefId ?? "");
    return { value: fieldKey === undefined ? null : scalar(custom[fieldKey]) };
  }
  switch (mapping.targetKey ?? "") {
    case "emails": {
      const addresses = personEmails(person);
      return { value: addresses[0] ?? null, addresses };
    }
    case "org":
      return {
        value: linkedOrg === null ? null : scalar(linkedOrg.name),
        occupied: linkedOrg === null && person.orgId !== null,
      };
    case "name":
      return { value: scalar(person.name) };
    case "firstName":
      return { value: scalar(person.firstName) };
    case "lastName":
      return { value: scalar(person.lastName) };
    default:
      return { value: null };
  }
}

export async function readPersonCurrent(
  db: Db,
  person: Person,
  mappings: readonly ResolvedMapping[],
  signal: AbortSignal,
  linkedOrg: { name: string; domain: string | null } | null = null,
): Promise<CurrentValues> {
  const customFieldKeyById = await customFieldKeys(db, mappings, signal);
  const custom = person.customFields as Record<string, unknown>;
  const canonicalValues: Record<string, string | number | null> = {};
  const multiValues: Record<string, readonly string[]> = {};
  const occupiedKeys: string[] = [];

  for (const mapping of mappings) {
    const state = personTarget(mapping, person, linkedOrg, custom, customFieldKeyById);
    canonicalValues[mapping.canonicalKey] = state.value;
    if (state.addresses !== undefined) multiValues[mapping.canonicalKey] = state.addresses;
    if (state.occupied === true) occupiedKeys.push(mapping.canonicalKey);
  }

  return { canonicalValues, multiValues, occupiedKeys, customFieldKeyById };
}

export async function readOrgCurrent(
  db: Db,
  org: Organization,
  mappings: readonly ResolvedMapping[],
  signal: AbortSignal,
): Promise<CurrentValues> {
  const customFieldKeyById = await customFieldKeys(db, mappings, signal);
  const custom = org.customFields as Record<string, unknown>;
  const address = org.address ?? {};
  const columns: Record<string, unknown> = {
    name: org.name,
    domain: org.domain,
    industry: org.industry,
    employeeCount: org.employeeCount,
    annualRevenue: org.annualRevenue,
    linkedinUrl: org.linkedinUrl,
  };
  const canonicalValues: Record<string, string | number | null> = {};

  for (const mapping of mappings) {
    if (mapping.targetKind === "custom") {
      const fieldKey = customFieldKeyById.get(mapping.targetFieldDefId ?? "");
      canonicalValues[mapping.canonicalKey] =
        fieldKey === undefined ? null : scalar(custom[fieldKey]);
      continue;
    }
    const target = mapping.targetKey ?? "";
    canonicalValues[mapping.canonicalKey] = target.startsWith(ADDRESS_PREFIX)
      ? scalar(address[target.slice(ADDRESS_PREFIX.length)])
      : scalar(columns[target]);
  }

  return { canonicalValues, multiValues: {}, occupiedKeys: [], customFieldKeyById };
}

export async function loadPerson(db: Db, id: string, signal: AbortSignal): Promise<Person | null> {
  signal.throwIfAborted();
  const [row] = await db
    .select()
    .from(persons)
    .where(and(eq(persons.id, id), isNull(persons.deletedAt)));
  return row ?? null;
}

export async function loadOrg(
  db: Db,
  id: string,
  signal: AbortSignal,
): Promise<Organization | null> {
  signal.throwIfAborted();
  const [row] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, id), isNull(organizations.deletedAt)));
  return row ?? null;
}
