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

export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const idx = Number(m) - 1;
  const name = MONTH_NAMES[idx];
  if (y === undefined || name === undefined) return key;
  return `${name} ${y}`;
}

export function EngagementAxis({ months }: { months: string[] }): React.ReactNode {
  return (
    <thead>
      <tr>
        <th
          scope="col"
          className="sticky left-0 z-20 border-b border-r bg-muted px-3 py-2 text-left text-xs font-semibold text-muted-foreground"
        >
          Contact
        </th>
        {months.map((key, i) => (
          <th
            key={key}
            scope="col"
            className={`border-b bg-muted/40 px-3 py-2 text-center text-xs font-semibold text-muted-foreground ${i > 0 ? "border-l" : ""}`}
          >
            {i === months.length - 1 ? "Today" : monthLabel(key)}
          </th>
        ))}
      </tr>
    </thead>
  );
}
