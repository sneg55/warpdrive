import { eq, gte, isNull, lt, lte, type SQL, sql } from "drizzle-orm";
import { activities, activityTypes } from "@/db/schema";
import { endOfLocalDay, startOfLocalDay } from "@/lib/localDayRange";
import type { ActivityListFilter } from "./schemas";

function dueDatePredicates(filter: ActivityListFilter): SQL[] {
  const preds: SQL[] = [];
  if (filter.from !== null) preds.push(gte(activities.dueAt, new Date(`${filter.from}T00:00:00`)));
  if (filter.to !== null) preds.push(lte(activities.dueAt, new Date(`${filter.to}T23:59:59`)));
  return preds;
}

function doneDatePredicates(filter: ActivityListFilter, zone: string): SQL[] {
  const preds: SQL[] = [];
  if (filter.from !== null) preds.push(gte(activities.doneAt, startOfLocalDay(filter.from, zone)));
  if (filter.to !== null) preds.push(lt(activities.doneAt, endOfLocalDay(filter.to, zone)));
  return preds;
}

function pipelinePredicate(pipelineId: string): SQL {
  return sql`EXISTS (
    SELECT 1 FROM deals dp WHERE dp.id = ${activities.dealId} AND dp.pipeline_id = ${pipelineId}
  )`;
}

export function activityFilterPredicates(filter: ActivityListFilter, zone: string): SQL[] {
  const preds: SQL[] = [isNull(activities.deletedAt)];
  if (filter.ownerId !== null) preds.push(eq(activities.assigneeId, filter.ownerId));
  if (filter.done === "open") preds.push(eq(activities.done, false));
  else if (filter.done === "done") preds.push(eq(activities.done, true));
  preds.push(
    ...(filter.dateBasis === "done" ? doneDatePredicates(filter, zone) : dueDatePredicates(filter)),
  );
  if (filter.pipelineId !== null) preds.push(pipelinePredicate(filter.pipelineId));
  if (filter.typeKey !== null) preds.push(eq(activityTypes.key, filter.typeKey));
  return preds;
}
