"use client";

import { ChevronDown } from "lucide-react";
import type React from "react";
import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/Collapsible";
import { Tip } from "@/components/ui/tooltip";
import { MARKETING_STRINGS } from "@/constants/marketingStrings";
import { formatReaderDate, formatTimelineEmailDate } from "@/features/email/inboxDate";
import type { SupportScope } from "@/features/intercom/supportTypes";
import { MASK_CLASS } from "@/features/observability/replayMasking";
import { cn } from "@/lib/utils";
import type { MarketingCampaignItem } from "./types";

interface MarketingCampaignCardProps {
  campaign: MarketingCampaignItem;
  scope: SupportScope;
}

interface StatusBadge {
  label: string;
  at: string | null;
  variant: BadgeProps["variant"];
}

const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

function statusBadges(c: MarketingCampaignItem): StatusBadge[] {
  const s = MARKETING_STRINGS.status;
  return [
    { label: s.delivered, at: c.deliveredAt, variant: "secondary" },
    { label: s.opened, at: c.firstOpenedAt, variant: "success" },
    { label: s.clicked, at: c.firstClickedAt, variant: "success" },
    { label: s.softBounce, at: c.softBouncedAt, variant: "secondary" },
    { label: s.hardBounce, at: c.hardBouncedAt, variant: "destructive" },
    { label: s.complaint, at: c.complainedAt, variant: "destructive" },
    { label: s.unsubscribed, at: c.unsubscribedAt, variant: "destructive" },
  ];
}

function safeHref(url: string): string | null {
  try {
    return SAFE_PROTOCOLS.has(new URL(url).protocol) ? url : null;
  } catch {
    return null;
  }
}

function ClickedLinks({ urls }: { urls: string[] }): React.ReactNode {
  return (
    <Collapsible className="mt-2">
      <CollapsibleTrigger className="group flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground">
        <ChevronDown
          className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
        {MARKETING_STRINGS.clickedLinks(urls.length)}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className={cn("mt-1 space-y-0.5 text-xs", MASK_CLASS)}>
          {urls.map((url) => {
            const href = safeHref(url);
            return (
              <li key={url} className="truncate">
                {href === null ? (
                  <span className="text-muted-foreground">{url}</span>
                ) : (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {url}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function MarketingCampaignCard({
  campaign,
  scope,
}: MarketingCampaignCardProps): React.ReactNode {
  const badges = statusBadges(campaign).filter((b) => b.at !== null);
  const showRecipient = scope.kind !== "person";
  return (
    <article className="rounded-md border border-border bg-card p-3">
      <h3 className={cn("truncate text-sm font-semibold text-foreground", MASK_CLASS)}>
        {campaign.campaignName}
      </h3>
      {campaign.subject !== null && (
        <p className={cn("mt-0.5 truncate text-xs text-muted-foreground", MASK_CLASS)}>
          {campaign.subject}
        </p>
      )}
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        <span className="tabular-nums">
          {formatTimelineEmailDate(campaign.sentAt ?? campaign.at)}
        </span>
        {" · "}
        <span>{MARKETING_STRINGS.source}</span>
        {showRecipient && (
          <>
            {" · "}
            <span className={MASK_CLASS}>{campaign.recipientEmail}</span>
          </>
        )}
      </p>
      {badges.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {badges.map((b) => (
            <Tip key={b.label} label={formatReaderDate(b.at)}>
              <Badge variant={b.variant} tabIndex={0} data-testid="campaign-status">
                {b.label}
              </Badge>
            </Tip>
          ))}
        </div>
      )}
      {campaign.clickedUrls.length > 0 && <ClickedLinks urls={campaign.clickedUrls} />}
    </article>
  );
}
