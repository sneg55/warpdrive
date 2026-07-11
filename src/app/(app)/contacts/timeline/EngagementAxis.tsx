import type React from "react";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// "2026-05" -> "May 2026". Falls back to the raw key if it is ever malformed.
export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const idx = Number(m) - 1;
  const name = MONTH_NAMES[idx];
  if (y === undefined || name === undefined) return key;
  return `${name} ${y}`;
}

// The month header row of the engagement grid: a leading "Contact" cell, then one column per
// month. The parent grid owns the column template so this stays aligned with each lane row.
export function EngagementAxis({ months }: { months: string[] }): React.ReactNode {
  return (
    <div className="contents">
      <div className="border-b bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
        Contact
      </div>
      {months.map((key, i) => (
        <div
          key={key}
          className="border-b border-l bg-muted/40 px-3 py-2 text-center text-xs font-semibold text-muted-foreground"
        >
          {/* The period always ends at the current month, so the rightmost tick is "now": PD
              labels it "Today" rather than repeating the month name. */}
          {i === months.length - 1 ? "Today" : monthLabel(key)}
        </div>
      ))}
    </div>
  );
}
