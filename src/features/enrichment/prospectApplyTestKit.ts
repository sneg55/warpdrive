import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { toContactActor } from "@/features/contacts/actorAdapters";
import type { ContactActor } from "@/features/contacts/personsRepo";
import { toActor } from "@/features/stats/statsTestHelpers";
import { mappingsFingerprint } from "./mappingsFingerprint";
import { listMappings } from "./mappingsRepo";
import type { ProspectProfile, ProviderId, ProviderOutcome } from "./providers/types";

export type UserRow = typeof schema.users.$inferSelect;
export type RevealRow = typeof schema.prospectReveals.$inferSelect;

export const SIG = (): AbortSignal => AbortSignal.timeout(20_000);

export function outcomeFrom(
  provider: ProviderId,
  fields: Record<string, string | number>,
): ProviderOutcome {
  return { provider, kind: "ok", candidate: { fields } };
}

export function actorOf(user: UserRow, flags: readonly PermissionFlagKey[] = []): ContactActor {
  return toContactActor({ ...toActor(user), flags: new Set(flags) });
}

export async function personFingerprint(db: Db): Promise<string> {
  return mappingsFingerprint(await listMappings(db, "person", SIG()));
}

export async function seedOrg(
  db: Db,
  ownerId: string,
): Promise<typeof schema.organizations.$inferSelect> {
  const [row] = await db
    .insert(schema.organizations)
    .values({
      name: `Acme-${Math.random().toString(36).slice(2)}`,
      ownerId,
      visibilityLevel: "all",
    })
    .returning();
  if (row === undefined) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "no organization row");
  return row;
}

export async function seedPerson(
  db: Db,
  values: Partial<typeof schema.persons.$inferInsert> & { ownerId: string },
): Promise<typeof schema.persons.$inferSelect> {
  const [row] = await db
    .insert(schema.persons)
    .values({
      name: "Grace Hopper",
      firstName: "Grace",
      lastName: "Hopper",
      visibilityLevel: "all",
      ...values,
    })
    .returning();
  if (row === undefined) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "no person row");
  return row;
}

export async function seedReveal(
  db: Db,
  args: {
    orgId: string;
    requestedBy: string;
    batchId: string;
    providerRef: string;
    outcomes: ProviderOutcome[];
    profile?: Partial<ProspectProfile>;
  },
): Promise<RevealRow> {
  const [row] = await db
    .insert(schema.prospectReveals)
    .values({
      batchId: args.batchId,
      orgId: args.orgId,
      requestedBy: args.requestedBy,
      providerRef: args.providerRef,
      searchProvider: "apollo",
      profile: {
        providerRef: args.providerRef,
        fullName: "Ada Lovelace",
        firstName: "Ada",
        lastName: "Lovelace",
        hasEmail: true,
        hasPhone: false,
        ...args.profile,
      },
      outcomes: args.outcomes,
    })
    .returning();
  if (row === undefined) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "no prospect reveal row");
  return row;
}
