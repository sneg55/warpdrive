import type { CalendarActivity } from "./calendar";
import { placeBlock } from "./weekAgenda";

export const ALL_DAY_ROW_HEIGHT_PX = 22;

const MAX_TIMED_LANES = 2;
export const MAX_ALL_DAY_ROWS = 3;

export function allDayRowCount(itemsByDay: Iterable<CalendarActivity[]>): number {
  let max = 0;
  for (const items of itemsByDay) max = Math.max(max, splitAllDay(items).allDay.length);
  return Math.min(max, MAX_ALL_DAY_ROWS);
}

export function splitAllDayDisplay(
  items: CalendarActivity[],
  rows: number,
): { visible: CalendarActivity[]; hidden: CalendarActivity[] } {
  if (items.length <= rows) return { visible: items, hidden: [] };
  return { visible: items.slice(0, rows - 1), hidden: items.slice(rows - 1) };
}

export interface TimedPlacement {
  activity: CalendarActivity;
  topPx: number;
  heightPx: number;
  leftPct: number;
  widthPct: number;
  overflowing: boolean;
}

export interface TimedOverflow {
  activities: CalendarActivity[];
  topPx: number;
  heightPx: number;
}

export function splitAllDay(items: CalendarActivity[]): {
  allDay: CalendarActivity[];
  timed: CalendarActivity[];
} {
  const allDay: CalendarActivity[] = [];
  const timed: CalendarActivity[] = [];
  for (const a of items) (a.allDay ? allDay : timed).push(a);
  return { allDay, timed };
}

interface Extent {
  activity: CalendarActivity;
  topPx: number;
  heightPx: number;
  endPx: number;
}

function extents(items: CalendarActivity[]): Extent[] {
  return items
    .map((activity) => {
      const { topPx, heightPx } = placeBlock(activity.dueAt, activity.durationMinutes);
      return { activity, topPx, heightPx, endPx: topPx + heightPx };
    })
    .sort(
      (a, b) =>
        a.topPx - b.topPx || b.endPx - a.endPx || a.activity.id.localeCompare(b.activity.id),
    );
}

function clusters(sorted: Extent[]): Extent[][] {
  const out: Extent[][] = [];
  let current: Extent[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;
  for (const e of sorted) {
    if (current.length > 0 && e.topPx >= clusterEnd) {
      out.push(current);
      current = [];
      clusterEnd = Number.NEGATIVE_INFINITY;
    }
    current.push(e);
    clusterEnd = Math.max(clusterEnd, e.endPx);
  }
  if (current.length > 0) out.push(current);
  return out;
}

function assignLanes(cluster: Extent[]): { lanes: number[]; laneCount: number } {
  const laneEnds: number[] = [];
  const lanes = cluster.map((e) => {
    const lane = laneEnds.findIndex((end) => e.topPx >= end);
    const index = lane === -1 ? laneEnds.length : lane;
    laneEnds[index] = e.endPx;
    return index;
  });
  return { lanes, laneCount: laneEnds.length };
}

function layoutCluster(
  cluster: Extent[],
  placements: TimedPlacement[],
  overflows: TimedOverflow[],
): void {
  const { lanes, laneCount } = assignLanes(cluster);
  const overflowing = laneCount > MAX_TIMED_LANES;
  const shownLanes = overflowing ? MAX_TIMED_LANES - 1 : laneCount;
  const widthPct = 100 / shownLanes;
  const hidden: Extent[] = [];
  cluster.forEach((e, i) => {
    const lane = lanes[i] ?? 0;
    if (lane >= shownLanes) {
      hidden.push(e);
      return;
    }
    placements.push({
      activity: e.activity,
      topPx: e.topPx,
      heightPx: e.heightPx,
      leftPct: widthPct * lane,
      widthPct,
      overflowing,
    });
  });
  if (hidden.length === 0) return;
  const topPx = Math.min(...hidden.map((e) => e.topPx));
  const endPx = Math.max(...hidden.map((e) => e.endPx));
  overflows.push({
    activities: hidden.map((e) => e.activity),
    topPx,
    heightPx: endPx - topPx,
  });
}

export function layoutTimed(items: CalendarActivity[]): {
  placements: TimedPlacement[];
  overflows: TimedOverflow[];
} {
  const placements: TimedPlacement[] = [];
  const overflows: TimedOverflow[] = [];
  for (const cluster of clusters(extents(items))) layoutCluster(cluster, placements, overflows);
  return { placements, overflows };
}
