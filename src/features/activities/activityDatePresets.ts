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

export function activePreset(range: PresetRange, today: Date): ActivityDatePreset | null {
  const presets: ActivityDatePreset[] = ["todo", "today", "overdue", "this_week"];
  for (const p of presets) {
    const r = presetRange(p, today);
    if (r.from === range.from && r.to === range.to) return p;
  }
  return null;
}
