// Quick time-preset date ranges for the activities list (A1). Each preset resolves to the
// filter's inclusive local-day bounds (from/to, "YYYY-MM-DD"); presets touch the date range
// only, orthogonal to the Status (open/done/all) dropdown. Week is Monday-first to match the
// in-app calendar. `today` is passed in so the logic stays pure and testable.

export type ActivityDatePreset = "overdue" | "today" | "this_week" | "todo";

export interface PresetRange {
  from: string | null;
  to: string | null;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function addLocalDays(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() + n);
  return r;
}

// Monday (local) that begins the week containing `d`. getDay(): 0=Sun..6=Sat.
function mondayOf(d: Date): Date {
  const dow = d.getDay();
  return addLocalDays(d, dow === 0 ? -6 : 1 - dow);
}

export function presetRange(preset: ActivityDatePreset, today: Date): PresetRange {
  switch (preset) {
    case "today":
      return { from: ymd(today), to: ymd(today) };
    case "overdue":
      return { from: null, to: ymd(addLocalDays(today, -1)) };
    case "this_week": {
      const start = mondayOf(today);
      return { from: ymd(start), to: ymd(addLocalDays(start, 6)) };
    }
    case "todo":
      return { from: null, to: null };
  }
}

// Which preset (if any) a given range corresponds to, for active-chip highlighting.
// Order matters: to-do (fully cleared) is checked before overdue (also from-null).
export function activePreset(range: PresetRange, today: Date): ActivityDatePreset | null {
  const presets: ActivityDatePreset[] = ["todo", "today", "overdue", "this_week"];
  for (const p of presets) {
    const r = presetRange(p, today);
    if (r.from === range.from && r.to === range.to) return p;
  }
  return null;
}
