import type { CalendarActivity } from "./calendar";
import { placeBlock } from "./weekAgenda";

// Where one timed activity sits in a day column. topPx/heightPx come from placeBlock; leftPct and
// widthPct are the horizontal lane, so activities sharing a time range sit beside each other
// instead of one covering the other.
// Height of one chip in the all-day lane. The lane reserves a whole number of these across the
// week so every column's hour grid starts at the same y and a given hour stays level.
export const ALL_DAY_ROW_HEIGHT_PX = 22;

// Ceilings on how much a column subdivides before a chip stops being readable. A week column is
// roughly 200px: half of it still fits a subject and part of a record name, a third fits three
// letters. Past the cap the remainder collapses into a "+N more" chip rather than shrinking every
// chip in the day. The more-chip itself only has to fit "+12 more", so it takes a narrow slice
// rather than a whole lane.
export const MAX_TIMED_LANES = 2;
export const MAX_ALL_DAY_ROWS = 3;

// The tallest all-day stack in the week, which is the lane height every column must reserve.
export function allDayRowCount(itemsByDay: Iterable<CalendarActivity[]>): number {
  let max = 0;
  for (const items of itemsByDay) max = Math.max(max, splitAllDay(items).allDay.length);
  return Math.min(max, MAX_ALL_DAY_ROWS);
}

// How one day's all-day stack fills the week-wide lane. Once the stack outgrows the lane the last
// row goes to the more-chip, so the overflow is always counted rather than silently clipped.
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
  // This chip shares its row with a more-chip. The renderer gives the more-chip a pixel floor
  // (a percentage of a narrow column cannot fit "+12 more") and this chip whatever is left.
  overflowing: boolean;
}

// The lanes a cluster could not fit, gathered into one block pinned to the right of the column.
// Clicking it lists what it stands for, so nothing is dropped from the day, only from the grid.
// Horizontal geometry is the renderer's: the chip needs a pixel floor, not a share of the column.
export interface TimedOverflow {
  activities: CalendarActivity[];
  topPx: number;
  heightPx: number;
}

// An all-day activity is stored at midnight with no duration, so the hour grid would render it as a
// 00:00 block above an empty day. It belongs in the column's own all-day lane instead.
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

// Overlap is decided on the rendered extent, not the stored duration: a duration-less activity
// still paints placeBlock's minimum block, so two of them at the same minute do collide on screen.
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

// A cluster is a run of activities connected by overlap: each one starts before everything already
// in the run has ended. Width is decided per cluster, so a busy morning does not shrink an
// afternoon that happens to be free.
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

// Greedy lane assignment: take the lowest lane whose last activity has already ended, so a gap
// inside a cluster is reused rather than costing every activity in it another column.
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
  // Past the cap one lane is spent on the more-chip. How wide that chip is belongs to the renderer,
  // which can give it a pixel floor; a percentage of a narrow column cannot fit "+12 more".
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
