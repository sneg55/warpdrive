// Client-side time assembly for the activity composer. Combines the date + time inputs
// into the existing dueAt (ISO) and durationMinutes fields, so the composer no longer
// hardcodes a 09:00 due time. Same-day only (no multi-day end date).

// Expects zero-padded HH:mm as emitted by <input type="time">; non-padded input
// (e.g. "9:00") is treated as invalid.
function toMinutes(time: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (m === null) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function composeDueAtIso(startDate: string, startTime: string): string | null {
  if (startDate === "") return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
  if (parts === null) return null;
  const time = startTime === "" ? "00:00" : startTime;
  const d = new Date(`${startDate}T${time}`);
  if (Number.isNaN(d.getTime())) return null;
  // Reject calendar-invalid dates (e.g. 2026-02-30) that Date silently rolls forward:
  // require the constructed local date to round-trip the input components.
  if (
    d.getFullYear() !== Number(parts[1]) ||
    d.getMonth() + 1 !== Number(parts[2]) ||
    d.getDate() !== Number(parts[3])
  ) {
    return null;
  }
  return d.toISOString();
}

export function deriveDurationMinutes(startTime: string, endTime: string): number | null {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (start === null || end === null) return null;
  return end > start ? end - start : null;
}
