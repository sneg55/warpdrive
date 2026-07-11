import Link from "next/link";
import type React from "react";

export interface Crumb {
  label: string;
  // A parent crumb links somewhere; the current (last) crumb omits href and renders as plain text.
  href?: string;
}

// Shared page heading: a Pipedrive-style breadcrumb over a 25px page title. Centralizing the title
// size + breadcrumb here stops the per-page drift (bare 18-20px titles, no breadcrumb) the parity
// specs flagged across settings, contacts, leads, and inbox.
export function PageHeading({
  title,
  crumbs,
  description,
  actions,
}: {
  title: string;
  crumbs?: Crumb[];
  description?: React.ReactNode;
  actions?: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="mb-4">
      {crumbs !== undefined && crumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="mb-1">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            {crumbs.map((crumb, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <li
                  key={`${crumb.label}-${crumb.href ?? "current"}`}
                  className="flex items-center gap-1"
                >
                  {i > 0 ? (
                    <span aria-hidden="true" className="text-muted-foreground/60">
                      /
                    </span>
                  ) : null}
                  {crumb.href !== undefined && !isLast ? (
                    <Link href={crumb.href} className="hover:text-foreground">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current={isLast ? "page" : undefined} className="text-foreground">
                      {crumb.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        {/* PD renders the page title at 25px / ~450 weight (lighter than semibold). Inter is a
            vendored variable font, so the arbitrary 450 weight resolves crisply. */}
        <h1 className="text-[25px] font-[450] leading-tight tracking-tight">{title}</h1>
        {actions}
      </div>
      {description !== undefined ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
