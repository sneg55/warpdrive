import { asc, isNull } from "drizzle-orm";
import { z } from "zod";
import { activityTypes } from "@/db/schema";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { listActivityRows } from "./activityRows";
import { getBusyWindows } from "./availability";
import { calendarRange } from "./calendar";
import { listActivitiesForEntity } from "./forEntity";
import { activityListFilter, activitySortInput } from "./schemas";

// listRows' input: the list filter (every field defaulted, so an empty call still resolves to
// the default "open" view) plus an optional sort (still separate from the filter's own shape,
// since ActivityListFilter is also the exact type listActivityRows and its tests expect).
const listRowsInput = activityListFilter.extend({ sort: activitySortInput.optional() });

export const activitiesRouter = router({
  // All visible activities enriched for the Activities table (deal/contact/org/priority).
  listRows: protectedProcedure.input(listRowsInput).query(({ ctx, input }) => {
    const { sort, ...filter } = input;
    return listActivityRows(ctx.db, ctx.actor, filter, AbortSignal.timeout(10_000), sort);
  }),

  // Activity type catalog for the create modal (call/meeting/task/deadline/email/lunch).
  // Only active (non-archived) types are offered when creating an activity.
  listTypes: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select({ id: activityTypes.id, key: activityTypes.key, name: activityTypes.name })
      .from(activityTypes)
      .where(isNull(activityTypes.archivedAt))
      .orderBy(asc(activityTypes.order)),
  ),

  // calendarRange returns CalendarActivity[] (not a Result); no unwrap needed.
  // Client sends ISO datetime strings; convert to Date before the repo call.
  calendarRange: protectedProcedure
    .input(z.object({ from: z.string().datetime(), to: z.string().datetime() }))
    .query(({ ctx, input }) =>
      calendarRange(
        ctx.db,
        ctx.actor,
        { from: new Date(input.from), to: new Date(input.to) },
        AbortSignal.timeout(10_000),
      ),
    ),

  listForEntity: protectedProcedure
    .input(
      z.object({
        entityType: z.enum(["deal", "person", "organization"]),
        entityId: z.string().uuid(),
      }),
    )
    .query(({ ctx, input }) =>
      listActivitiesForEntity(
        ctx.db,
        ctx.actor,
        input.entityType,
        input.entityId,
        AbortSignal.timeout(10_000),
      ),
    ),

  // Read-only Free/Busy signal for the composer: is the assignee already booked in [from, to]?
  // Defaults the assignee to the current actor. Returns a coarse boolean, never activity details.
  availability: protectedProcedure
    .input(
      z.object({
        userId: z.string().uuid().nullable().default(null),
        from: z.string().datetime(),
        to: z.string().datetime(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const windows = await getBusyWindows(
        ctx.db,
        {
          userId: input.userId ?? ctx.actor.id,
          from: new Date(input.from),
          to: new Date(input.to),
        },
        AbortSignal.timeout(10_000),
      );
      return { busy: windows.length > 0 };
    }),
});
