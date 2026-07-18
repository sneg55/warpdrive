import { Check, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { STRINGS } from "@/constants/strings";
import { Reveal } from "./Reveal";

const S = STRINGS.landing.comparison;

export function ComparisonSection(): ReactNode {
  return (
    <section id="compare" className="scroll-mt-14 border-t py-24">
      <div className="mx-auto max-w-4xl px-6">
        <h2 className="text-balance text-center text-3xl font-semibold tracking-tight">
          {S.heading}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-pretty text-center text-muted-foreground">
          {S.sub}
        </p>
        <Reveal>
          <div data-reveal className="mt-10 overflow-hidden rounded-lg border bg-card shadow-sm">
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
                    <td className="p-3.5 font-medium">{row.warpdrive}</td>
                    <td className="p-3.5 text-muted-foreground">{row.pipedrive}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div data-reveal className="mt-6 space-y-2">
            <p className="flex gap-2.5 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              <span className="text-muted-foreground">{S.covered}</span>
            </p>
            <p className="flex gap-2.5 text-sm">
              <Minus className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-muted-foreground">{S.outOfScope}</span>
            </p>
          </div>
        </Reveal>
        <p className="mt-8 text-center text-xs text-muted-foreground">{S.disclaimer}</p>
      </div>
    </section>
  );
}
