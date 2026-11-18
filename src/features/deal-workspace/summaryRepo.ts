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
  pipelineVisibilityGroupId: string | null;
  ownerName: string | null;
  owner: UserRef | null;
  person: Person | null;
  org: Organization | null;
  stageProgress: StageProgress;
  followers: UserRef[];
  isFollowedBySelf: boolean;
  followerIds: string[];
  lostReasonName: string | null;
  lostReasonOptions: Array<{ id: string; name: string }>;
  customFieldDefs: CustomFieldDef[];
  personCustomFieldDefs: CustomFieldDef[];
  organizationCustomFieldDefs: CustomFieldDef[];
};

export async function getWorkspace(
  db: Db,
  actor: AuthUser,
  dealId: string,
  signal: AbortSignal,
): Promise<Result<DealWorkspace, AppError>> {
  signal.throwIfAborted();

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

  const [pipe] = await db
    .select({
      vg: pipelines.visibilityGroupId,
      isArchived: pipelines.isArchived,
      name: pipelines.name,
    })
    .from(pipelines)
    .where(eq(pipelines.id, deal.pipelineId));
  if (pipe === undefined) {
    return err(new AppError(ERROR_IDS.DEAL_NOT_FOUND, "not found", { dealId }));
  }
  if (pipe.isArchived) {
    return err(new AppError(ERROR_IDS.DEAL_NOT_FOUND, "not found", { dealId }));
  }
  if (!canSee(actor, toVisibleDeal(deal, pipe.vg))) {
    return err(new AppError(ERROR_IDS.DEAL_NOT_FOUND, "not found", { dealId }));
  }
  signal.throwIfAborted();

  const [
    stageRows,
    [person],
    [org],
    followers,
    [lr],
    [owner],
    lostReasonOptions,
    customFieldDefs,
    personCustomFieldDefs,
    organizationCustomFieldDefs,
  ] = await Promise.all([
    db.select().from(stages).where(eq(stages.pipelineId, deal.pipelineId)),

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

    db
      .select({ id: lostReasons.id, name: lostReasons.name })
      .from(lostReasons)
      .where(isNull(lostReasons.archivedAt)),

    listDefs(db, "deal", {}, signal),
    listDefs(db, "person", {}, signal),
    listDefs(db, "organization", {}, signal),
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
    person: person ?? null,
    org: org ?? null,
    stageProgress: buildStageProgress(deal, stageRows),
    followers,
    isFollowedBySelf,
    followerIds,
    lostReasonName: lr?.name ?? null,
    lostReasonOptions,
    customFieldDefs,
    personCustomFieldDefs,
    organizationCustomFieldDefs,
  });
}
