import type { ReactNode } from "react";
import { MIGRATION_STRINGS } from "@/constants/migrationStrings";
import { buildWebPageData } from "@/constants/pageStructuredData";
import { MIGRATION_PAGE } from "@/constants/sitePages";
import { CTA_PRIMARY } from "@/features/landing/ctaClasses";
import { BulletCard } from "@/features/landing/BulletCard";
import { SiteShell } from "@/features/landing/SiteShell";
import { SubpageSection } from "@/features/landing/SubpageSection";

const S = MIGRATION_STRINGS;
const HEADING_ORDER = "migration-order-heading";

export function MigrationPage({ initialStars }: { initialStars: number | null }): ReactNode {
  return (
    <SiteShell initialStars={initialStars} structuredData={buildWebPageData(MIGRATION_PAGE)}>
      <SubpageSection heading={S.heading} summary={S.summary}>
        <h2 className="mt-12 text-xl font-semibold">{S.steps.heading}</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-muted-foreground">
          {S.steps.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        <h2 id={HEADING_ORDER} className="mt-12 text-xl font-semibold">
          {S.order.heading}
        </h2>
        <ol
          aria-labelledby={HEADING_ORDER}
          className="mt-4 list-decimal space-y-1 pl-5 text-muted-foreground"
        >
          {S.order.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <BulletCard heading={S.kept.heading} items={S.kept.items} />
          <BulletCard heading={S.notCarried.heading} items={S.notCarried.items} />
        </div>
        <p className="mt-8 text-pretty text-muted-foreground">{S.rerun}</p>
        <div className="mt-10">
          <a href={S.guideHref} className={CTA_PRIMARY}>
            {S.guideLabel}
          </a>
        </div>
        <p className="mt-8 text-xs text-muted-foreground">{S.disclaimer}</p>
      </SubpageSection>
    </SiteShell>
  );
}
