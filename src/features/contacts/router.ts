import { z } from "zod";
import { RECIPIENT_SEARCH_MAX_EXCLUDE, RECIPIENT_SEARCH_MAX_QUERY } from "@/constants/email";
import { attachRefLabels } from "@/features/custom-fields/refLabels";
import { dealsForOrg, dealsForPerson } from "@/features/deal-workspace/participants";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { unwrap } from "@/server/unwrap";
import { activityStats } from "./activityStats";
import { toContactActor } from "./actorAdapters";
import { orgFilterSchema, personFilterSchema } from "./contactFilter";
import { contactsFeed } from "./contactsFeed";
import { contactTimeline } from "./contactTimeline";
import { engagementTimeline } from "./engagementTimeline";
import { getContactFollowers } from "./followers";
import { listPeople } from "./listPeople";
import { listOrgOptions } from "./orgOptionsRepo";
import { listRelatedOrgs } from "./orgRelations";
import { getOrg, listOrgs } from "./orgsRepo";
import { listPeopleForOrg, listPersonOptions } from "./personOptionsRepo";
import { getPerson } from "./personsRepo";
import { searchRecipients } from "./recipientSearch";
import { orgSortInput, personSortInput } from "./schemas";

export const contactsRouter = router({
  getPerson: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) =>
      unwrap(getPerson(ctx.db, toContactActor(ctx.actor), input.id, AbortSignal.timeout(10_000))),
    ),

  listPeople: protectedProcedure
    .input(
      z.object({
        offset: z.number().int().nonnegative().default(0),
        limit: z.number().int().min(1).max(500).default(50),
        sort: personSortInput.optional(),
        filter: personFilterSchema.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const signal = AbortSignal.timeout(10_000);
      const res = await listPeople(
        ctx.db,
        toContactActor(ctx.actor),
        { offset: input.offset, limit: input.limit, sort: input.sort, filter: input.filter },
        signal,
      );
      return attachRefLabels(ctx.db, ctx.actor, "person", res, signal);
    }),

  personOptions: protectedProcedure.query(({ ctx }) =>
    listPersonOptions(ctx.db, toContactActor(ctx.actor), AbortSignal.timeout(10_000)),
  ),

  searchRecipients: protectedProcedure
    .input(
      z.object({
        query: z.string().trim().min(1).max(RECIPIENT_SEARCH_MAX_QUERY),
        exclude: z.array(z.string().max(320)).max(RECIPIENT_SEARCH_MAX_EXCLUDE).default([]),
      }),
    )
    .query(({ ctx, input }) =>
      searchRecipients(
        ctx.db,
        toContactActor(ctx.actor),
        input.query,
        AbortSignal.timeout(10_000),
        input.exclude,
      ),
    ),

  orgOptions: protectedProcedure.query(({ ctx }) =>
    listOrgOptions(ctx.db, toContactActor(ctx.actor), AbortSignal.timeout(10_000)),
  ),

  getOrg: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) =>
      unwrap(getOrg(ctx.db, toContactActor(ctx.actor), input.id, AbortSignal.timeout(10_000))),
    ),

  listPeopleForOrg: protectedProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      listPeopleForOrg(ctx.db, toContactActor(ctx.actor), input.orgId, AbortSignal.timeout(10_000)),
    ),

  dealsForPerson: protectedProcedure
    .input(z.object({ personId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      dealsForPerson(ctx.db, ctx.actor, input.personId, AbortSignal.timeout(10_000)),
    ),

  dealsForOrg: protectedProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      dealsForOrg(ctx.db, ctx.actor, input.orgId, AbortSignal.timeout(10_000)),
    ),

  listOrgs: protectedProcedure
    .input(
      z.object({
        offset: z.number().int().nonnegative().default(0),
        limit: z.number().int().min(1).max(500).default(50),
        sort: orgSortInput.optional(),
        filter: orgFilterSchema.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const signal = AbortSignal.timeout(10_000);
      const res = await listOrgs(
        ctx.db,
        toContactActor(ctx.actor),
        { offset: input.offset, limit: input.limit, sort: input.sort, filter: input.filter },
        signal,
      );
      return attachRefLabels(ctx.db, ctx.actor, "organization", res, signal);
    }),

  contactTimeline: protectedProcedure
    .input(
      z.object({
        entityType: z.enum(["person", "organization"]),
        entityId: z.string().uuid(),
      }),
    )
    .query(({ ctx, input }) =>
      contactTimeline(
        ctx.db,
        ctx.actor,
        input.entityType,
        input.entityId,
        AbortSignal.timeout(10_000),
      ),
    ),

  activityStats: protectedProcedure
    .input(
      z.object({
        entityType: z.enum(["person", "organization"]),
        entityId: z.string().uuid(),
      }),
    )
    .query(({ ctx, input }) =>
      activityStats(
        ctx.db,
        ctx.actor,
        input.entityType,
        input.entityId,
        AbortSignal.timeout(10_000),
      ),
    ),

  relatedOrgs: protectedProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      listRelatedOrgs(ctx.db, ctx.actor, input.orgId, AbortSignal.timeout(10_000)),
    ),

  contactFollowers: protectedProcedure
    .input(
      z.object({
        entityType: z.enum(["person", "organization"]),
        entityId: z.string().uuid(),
      }),
    )
    .query(({ ctx, input }) =>
      getContactFollowers(
        ctx.db,
        ctx.actor,
        input.entityType,
        input.entityId,
        AbortSignal.timeout(10_000),
      ),
    ),

  engagementTimeline: protectedProcedure
    .input(
      z.object({
        entity: z.enum(["person", "organization"]).default("person"),
        monthsBack: z.number().int().min(1).max(24).default(3),
        ownerId: z.string().uuid().nullable().default(null),
        typeKey: z.string().min(1).nullable().default(null),
      }),
    )
    .query(({ ctx, input }) =>
      engagementTimeline(
        ctx.db,
        ctx.actor,
        {
          entity: input.entity,
          monthsBack: input.monthsBack,
          ownerId: input.ownerId,
          typeKey: input.typeKey,
        },
        AbortSignal.timeout(10_000),
      ),
    ),

  contactsFeed: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
        before: z.string().datetime().nullable().default(null),
        beforeId: z.string().uuid().nullable().default(null),
      }),
    )
    .query(({ ctx, input }) =>
      contactsFeed(
        ctx.db,
        ctx.actor,
        { limit: input.limit, before: input.before, beforeId: input.beforeId },
        AbortSignal.timeout(10_000),
      ),
    ),
});
