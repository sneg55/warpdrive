import { z } from "zod";
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
    .query(({ ctx, input }) =>
      listPeople(
        ctx.db,
        toContactActor(ctx.actor),
        { offset: input.offset, limit: input.limit, sort: input.sort, filter: input.filter },
        AbortSignal.timeout(10_000),
      ),
    ),

  // Full visible {id,name} sets (no pagination cap) for the Add deal/lead comboboxes, which need
  // every option both to select and to run the duplicate-name check.
  personOptions: protectedProcedure.query(({ ctx }) =>
    listPersonOptions(ctx.db, toContactActor(ctx.actor), AbortSignal.timeout(10_000)),
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
    .query(({ ctx, input }) =>
      listOrgs(
        ctx.db,
        toContactActor(ctx.actor),
        { offset: input.offset, limit: input.limit, sort: input.sort, filter: input.filter },
        AbortSignal.timeout(10_000),
      ),
    ),

  // Merged Focus/History feed (Wave 3, Task 21): activities + notes + change-log events
  // for a single person or organization, visibility-gated the same way getPerson/getOrg are.
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

  // Per-contact activity stats for the detail "Overview" section (CO-2): counts-by-type +
  // last-activity/inactive-days, visibility-gated through listActivitiesForEntity.
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

  // Related organizations panel (Wave 3, Task 23): both directions of organization_relations
  // for a single org, visibility-gated the same way getOrg is.
  relatedOrgs: protectedProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      listRelatedOrgs(ctx.db, ctx.actor, input.orgId, AbortSignal.timeout(10_000)),
    ),

  // Followers control (Wave 3, Task 24): self-follow state + follower list for a person or
  // organization, visibility-gated the same way contactTimeline/relatedOrgs are.
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

  // Per-contact engagement timeline (CO-4): activities rolled up per visible person/org, bucketed
  // by month across a period window, for the Pipedrive-style engagement grid. Owner = assignee
  // filter; type = activity-type key; entity picks person vs organization lanes.
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

  // Cross-contact activity timeline (Wave 3, Task 22): recent contact-linked activity across
  // every visible person/org, newest first, paginated by a due-date cursor.
  contactsFeed: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
        before: z.string().datetime().nullable().default(null),
        // Compound cursor tiebreaker (see contactsFeed.ts): ORDER BY breaks ties on dueAt with
        // asc(id), so pagination must too, or rows sharing an exact due_at at a page boundary
        // get skipped.
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
