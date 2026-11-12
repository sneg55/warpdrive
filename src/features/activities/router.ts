import { TRPCError } from "@trpc/server";
import { asc, isNull } from "drizzle-orm";
import { z } from "zod";
import { DEFAULT_DAILY_ACTIVITY_TARGET } from "@/constants/activityLoad";
import { activityTypes } from "@/db/schema";
import { getPreferencesForActor } from "@/features/identity/preferencesForActor";
import { viewerTimeZone } from "@/features/identity/viewerTimeZone";
import { FALLBACK_ZONE } from "@/lib/localDayRange";
import { timeZoneInput } from "@/schemas/timeZoneInput";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { listActivityRows } from "./activityRows";
import { getBusyWindows } from "./availability";
import { calendarRange } from "./calendar";
import { getDayLoad } from "./dayLoad";
import { listActivitiesForEntity } from "./forEntity";
import { getActivityForEdit } from "./getForEdit";
import { activityListFilter, activitySortInput } from "./schemas";

const listRowsInput = activityListFilter.extend({
  sort: activitySortInput.optional(),
  timeZone: timeZoneInput,
});

export const activitiesRouter = router({
  listRows: protectedProcedure.input(listRowsInput).query(async ({ ctx, input }) => {
    const { sort, timeZone, ...filter } = input;
    const signal = AbortSignal.timeout(10_000);
    const zone =
      filter.dateBasis === "done"
        ? await viewerTimeZone(ctx.db, ctx.actor.id, timeZone, signal)
        : FALLBACK_ZONE;
    return listActivityRows(ctx.db, ctx.actor, filter, signal, sort, zone);
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

  // Full activity (incl. guest/participant sets) for prefilling the inline edit composer.
  // Visibility-gated in getActivityForEdit; NOT_FOUND on missing/invisible so nothing leaks.
  getForEdit: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const r = await getActivityForEdit(ctx.db, ctx.actor, input.id, AbortSignal.timeout(10_000));
      if (!r.ok) throw new TRPCError({ code: "NOT_FOUND", message: r.error.id });
      return r.value;
    }),

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

  dayLoad: protectedProcedure
    .input(
      z.object({
        userId: z.string().uuid().nullable().default(null),
        from: z.string().datetime(),
        to: z.string().datetime(),
        timeZone: z.string().min(1).default("UTC"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = input.userId ?? ctx.actor.id;
      const [counts, prefs] = await Promise.all([
        getDayLoad(
          ctx.db,
          {
            userId,
            from: new Date(input.from),
            to: new Date(input.to),
            timeZone: input.timeZone,
          },
          AbortSignal.timeout(10_000),
        ),
        getPreferencesForActor(ctx.db, userId),
      ]);
      return { counts, target: prefs.ui.dailyActivityTarget ?? DEFAULT_DAILY_ACTIVITY_TARGET };
    }),
});
