import type { ReactNode } from "react";
import type { Competitor } from "@/constants/competitors";
import { buildWebPageData } from "@/constants/pageStructuredData";
import { BulletCard } from "@/features/landing/BulletCard";
import { SiteShell } from "@/features/landing/SiteShell";
import { SubpageSection } from "@/features/landing/SubpageSection";
import { COMPARE_UI } from "./compareUi";

export function CompetitorPage({
  competitor,
  initialStars,
}: {
  competitor: Competitor;
  initialStars: number | null;
}): ReactNode {
  return (
    <SiteShell initialStars={initialStars} structuredData={buildWebPageData(competitor.page)}>
      <SubpageSection heading={competitor.heading} summary={competitor.summary}>
        <div className="mt-10 overflow-x-auto rounded-lg border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3.5" />
                <th className="p-3.5 text-left font-semibold">{COMPARE_UI.warpdriveCol}</th>
                <th className="p-3.5 text-left font-medium text-muted-foreground">
                  {competitor.name}
                </th>
              </tr>
            </thead>
            <tbody>
              {competitor.rows.map((row) => (
                <tr key={row.label} className="border-b align-top last:border-0">
                  <th scope="row" className="p-3.5 text-left font-medium text-muted-foreground">
                    {row.label}
                  </th>
                  <td className="p-3.5 font-medium">{row.warpdrive}</td>
                  <td className="p-3.5 text-muted-foreground">{row.competitor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <BulletCard heading={COMPARE_UI.chooseWarpdrive} items={competitor.chooseWarpdrive} />
          <BulletCard
            heading={`${COMPARE_UI.choosePrefix} ${competitor.name} ${COMPARE_UI.chooseSuffix}`}
            items={competitor.chooseCompetitor}
          />
        </div>
        <h2 className="mt-12 text-lg font-semibold">{COMPARE_UI.sourcesHeading}</h2>
        <ul className="mt-3 space-y-1.5 text-sm">
          {competitor.sources.map((source) => (
            <li key={source.href}>
              <a
                href={source.href}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                {source.label}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-xs text-muted-foreground">{competitor.disclaimer}</p>
      </SubpageSection>
    </SiteShell>
  );
}
