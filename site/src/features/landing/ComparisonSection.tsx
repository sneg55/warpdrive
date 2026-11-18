import { ArrowRight, Check, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { STRINGS } from "@/constants/strings";
import { Reveal } from "./Reveal";

const S = STRINGS.landing.comparison;

function Cell({ value, strong }: { value: string | boolean; strong: boolean }): ReactNode {
  if (typeof value === "string") {
    return <span className={strong ? "font-medium" : "text-muted-foreground"}>{value}</span>;
  }
  const Icon = value ? Check : Minus;
  return (
    <span className="inline-flex items-center gap-2">
      <Icon
        className={`size-4 ${value ? "text-success" : "text-muted-foreground"}`}
        aria-hidden="true"
      />
      <span className={value ? "text-foreground" : "text-muted-foreground"}>
        {value ? S.yes : S.no}
      </span>
    </span>
  );
}

export function ComparisonSection(): ReactNode {
  return (
    <section id="compare" className="scroll-mt-14 border-t py-24">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div>
          <h2 className="text-balance text-3xl font-semibold tracking-tight">{S.heading}</h2>
          <p className="mt-3 text-pretty text-muted-foreground">{S.sub}</p>
          <p className="mt-6 text-pretty text-sm text-muted-foreground">{S.outOfScope}</p>
          <a
            href={S.fullHref}
            className="mt-6 inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-link underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {S.fullLink}
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
          <p className="mt-8 text-xs text-muted-foreground">{S.disclaimer}</p>
        </div>
        <Reveal>
          <div data-reveal className="overflow-x-auto rounded-lg border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3.5" />
                  <th className="p-3.5 text-left font-semibold">{S.warpdriveCol}</th>
                  <th className="p-3.5 text-left font-medium text-muted-foreground">
                    {S.pipedriveCol}
                  </th>
                </tr>
              </thead>
              <tbody>
                {S.rows.map((row) => (
                  <tr key={row.label} className="border-b last:border-0">
                    <th scope="row" className="p-3.5 text-left font-medium text-muted-foreground">
                      {row.label}
                    </th>
                    <td className="p-3.5">
                      <Cell value={row.warpdrive} strong />
                    </td>
                    <td className="p-3.5">
                      <Cell value={row.pipedrive} strong={false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
