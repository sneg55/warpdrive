// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarketingCampaignItem } from "@/features/brevo/types";
import type { SupportScope } from "@/features/intercom/supportTypes";

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    intercom: { list: { useQuery: () => ({ data: undefined }) } },
    files: { listForEntity: { useQuery: () => ({ data: [] }) } },
    collaboration: {
      listNotes: { useQuery: () => ({ data: [] }) },
      listChangeLog: { useQuery: () => ({ data: [] }) },
    },
    email: {
      listMessagesForDeal: { useQuery: () => ({ data: [] }) },
      drafts: { listForDeal: { useQuery: () => ({ data: [] }) } },
    },
    useUtils: () => ({}),
  },
}));
const hookScope = vi.fn();
const campaign: MarketingCampaignItem = {
  campaignId: 7,
  campaignName: "Autumn launch",
  subject: null,
  recipientEmail: "pat@example.com",
  recipientPersonId: "p1",
  at: "2026-08-18T17:04:00.000Z",
  sentAt: "2026-08-18T17:04:00.000Z",
  deliveredAt: null,
  firstOpenedAt: null,
  firstClickedAt: null,
  clickedUrls: [],
  hardBouncedAt: null,
  softBouncedAt: null,
  complainedAt: null,
  unsubscribedAt: null,
};
vi.mock("@/features/brevo/useMarketingCampaigns", () => ({
  useMarketingCampaigns: (scope: SupportScope) => {
    hookScope(scope);
    return { items: [campaign], truncated: false };
  },
}));
const cardScope = vi.fn();
vi.mock("@/features/brevo/MarketingCampaignCard", () => ({
  MarketingCampaignCard: (props: { campaign: MarketingCampaignItem; scope: unknown }) => {
    cardScope(props.scope);
    return <div data-testid="marketing-card">{props.campaign.campaignName}</div>;
  },
}));

import { WorkspaceTabs } from "./tabs";

afterEach(cleanup);

const deal = {
  id: "d1",
  title: "Deal",
  personId: "p1",
  createdAt: new Date("2026-08-18T17:03:00Z"),
} as unknown as Parameters<typeof WorkspaceTabs>[0]["deal"];

function renderTabs(tab: "email" | "all") {
  return render(
    <WorkspaceTabs
      deal={deal}
      tab={tab}
      onTab={() => {}}
      activities={[]}
      stages={[]}
      createdActorName="Jenny"
    />,
  );
}

describe("deal workspace marketing campaigns", () => {
  it("shows the deal's campaigns under Email and counts them", () => {
    renderTabs("email");
    expect(hookScope).toHaveBeenCalledWith({ kind: "deal", dealId: "d1" });
    expect(screen.getByTestId("marketing-card")).toHaveTextContent("Autumn launch");
    expect(cardScope).toHaveBeenCalledWith({ kind: "deal", dealId: "d1" });
    expect(screen.getByRole("tab", { name: "Email (1)" })).toBeInTheDocument();
  });

  it("shows the campaign under All", () => {
    renderTabs("all");
    expect(screen.getByTestId("marketing-card")).toBeInTheDocument();
  });
});
