// getWorkspace: aggregation for the deal detail page. READ gate only (a viewer who
// can SEE but not edit must still load), so this uses toVisibleDeal + canSee directly
// rather than loadEditableDeal. Building the VisibleDeal via toVisibleDeal (with the
// pipeline's visibility group) is what makes canSee's pipeline-restriction hard gate
// run; spreading the raw deal row would omit pipelineVisibilityGroupId and leak.
import { and, eq, isNull } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import {
  type Deal,
  dealFollowers,
  deals,
  lostReasons,
  type Organization,
  organizations,
  type Person,
  persons,
  pipelines,
  stages,
  users,
} from "@/db/schema";
import { listDefs } from "@/features/custom-fields/defsRepo";
import { toVisibleDeal } from "@/features/deals/dealAuth";
import { canSee } from "@/features/permissions/canSee";
import type { AuthUser } from "@/features/permissions/types";
import { isUuidParam } from "@/lib/isUuidParam";
import type { CustomFieldDef } from "@/types/customFields";
import { err, ok, type Result } from "@/types/result";
import { buildStageProgress, type StageProgress } from "./stageProgress";

type UserRef = { id: string; name: string; avatarUrl: string | null };

export type DealWorkspace = {
  deal: Deal;
  pipelineName: string;
  // The pipeline's visibility group. Loaded here for the canSee gate below and returned so the
  // deal page can build the same VisibleDeal without issuing a second query for the same row.
  pipelineVisibilityGroupId: string | null;
  ownerName: string | null; // kept for the sidebar; mirrors owner.name
  owner: UserRef | null;
  // custom_fields is stripped: the workspace sidebar renders only fixed person/org fields, so
  // shipping those jsonb blobs in the deal-open RSC payload was dead weight.
  person: Omit<Person, "customFields"> | null;
  org: Omit<Organization, "customFields"> | null;
  stageProgress: StageProgress;
  followers: UserRef[];
  isFollowedBySelf: boolean;
  followerIds: string[];
  lostReasonName: string | null;
  lostReasonOptions: Array<{ id: string; name: string }>;
  customFieldDefs: CustomFieldDef[];
};

// Drop the custom_fields jsonb from a person/org row before it enters the workspace RSC payload;
// the sidebar renders only fixed fields, so those blobs were serialized for nothing.
function withoutCustomFields<T extends { customFields: unknown }>(row: T): Omit<T, "customFields"> {
  const rest = { ...row };
  delete (rest as { customFields?: unknown }).customFields;
  return rest;
}

export async function getWorkspace(
  db: Db,
  actor: AuthUser,
  dealId: string,
  signal: AbortSignal,
): Promise<Result<DealWorkspace, AppError>> {
  signal.throwIfAborted();

  // A non-uuid dealId (a malformed [dealId] path param) can never match a row; return the
  // not-found err instead of letting Postgres reject the uuid cast and throw a 500.
  if (!isUuidParam(dealId)) {
    return err(new AppError(ERROR_IDS.DEAL_NOT_FOUND, "not found", { dealId }));
  }

  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, dealId), isNull(deals.deletedAt)));
  if (deal === undefined) {
    return err(new AppError(ERROR_IDS.DEAL_NOT_FOUND, "not found", { dealId }));
  }

  // Pipeline visibility group drives canSee's pipeline-restriction hard gate.
  const [pipe] = await db
    .select({
      vg: pipelines.visibilityGroupId,
      isArchived: pipelines.isArchived,
      name: pipelines.name,
    })
    .from(pipelines)
    .where(eq(pipelines.id, deal.pipelineId));
  if (pipe === undefined) {
    // Fail closed: a deal with no resolvable pipeline must not skip the gate.
    return err(new AppError(ERROR_IDS.DEAL_NOT_FOUND, "not found", { dealId }));
  }
  // Archived pipelines are hidden from list/board/search (F7/F9); a direct workspace read
  // by known dealId must not be an escape hatch, so 404 on an archived pipeline too.
  if (pipe.isArchived) {
    return err(new AppError(ERROR_IDS.DEAL_NOT_FOUND, "not found", { dealId }));
  }
  if (!canSee(actor, toVisibleDeal(deal, pipe.vg))) {
    return err(new AppError(ERROR_IDS.DEAL_NOT_FOUND, "not found", { dealId }));
  }
  signal.throwIfAborted();

  // Everything below the gate depends only on the already-loaded `deal`, so the reads are
  // issued together. Serialized, opening a deal cost one round trip per read.
  const [stageRows, [person], [org], followers, [lr], [owner], lostReasonOptions, customFieldDefs] =
    await Promise.all([
      db.select().from(stages).where(eq(stages.pipelineId, deal.pipelineId)),

      // Filter deletedAt so a soft-deleted contact is treated as absent, consistent with getPerson/
      // getOrg/listPeople. Otherwise DealSidebar renders a live link to a contact whose detail page
      // 404s (a dangling link).
      deal.personId !== null
        ? db
            .select()
            .from(persons)
            .where(and(eq(persons.id, deal.personId), isNull(persons.deletedAt)))
        : [],

      deal.orgId !== null
        ? db
            .select()
            .from(organizations)
            .where(and(eq(organizations.id, deal.orgId), isNull(organizations.deletedAt)))
        : [],

      // Followers resolved to display refs (name + avatar) for the header control.
      db
        .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
        .from(dealFollowers)
        .innerJoin(users, eq(users.id, dealFollowers.userId))
        .where(eq(dealFollowers.dealId, dealId)),

      deal.lostReasonId !== null
        ? db.select().from(lostReasons).where(eq(lostReasons.id, deal.lostReasonId))
        : [],

      db
        .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
        .from(users)
        .where(eq(users.id, deal.ownerId)),

      // Active lost reasons for the Lost picker (Pipedrive prompts for a reason on close).
      db
        .select({ id: lostReasons.id, name: lostReasons.name })
        .from(lostReasons)
        .where(isNull(lostReasons.archivedAt)),

      listDefs(db, "deal", {}, signal),
    ]);
  const followerIds = followers.map((f) => f.id);
  const isFollowedBySelf = followers.some((f) => f.id === actor.id);
  signal.throwIfAborted();

  return ok({
    deal,
    pipelineName: pipe.name,
    pipelineVisibilityGroupId: pipe.vg,
    ownerName: owner?.name ?? null,
    owner: owner ?? null,
    person: person !== undefined ? withoutCustomFields(person) : null,
    org: org !== undefined ? withoutCustomFields(org) : null,
    stageProgress: buildStageProgress(deal, stageRows),
    followers,
    isFollowedBySelf,
    followerIds,
    lostReasonName: lr?.name ?? null,
    lostReasonOptions,
    customFieldDefs,
  });
}
