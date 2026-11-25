// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarketingCampaignItem } from "@/features/brevo/types";
import type { HistoryItem } from "@/features/deal-workspace/historyTimeline";

vi.mock("@/lib/trpc-client", () => ({ trpc: { useUtils: () => ({}) } }));
vi.mock("@/features/brevo/MarketingCampaignCard", () => ({
  MarketingCampaignCard: ({ campaign }: { campaign: MarketingCampaignItem }) => (
    <div data-testid="marketing-card">{campaign.campaignName}</div>
  ),
}));

import { LeadTimeline } from "./LeadTimeline";

afterEach(cleanup);

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

const items: HistoryItem[] = [
  {
    kind: "marketingCampaign",
    id: "brevo-7:p1:pat@example.com",
    at: new Date("2026-08-18T17:04:00Z"),
    campaign,
    scope: { kind: "lead", leadId: "l1" },
  },
  {
    kind: "marketingTruncated",
    id: "brevo-truncated",
    at: new Date("2026-08-18T17:03:59Z"),
    limit: 500,
  },
];

describe("LeadTimeline marketing campaigns", () => {
  it("shows a campaign under All", () => {
    render(<LeadTimeline items={items} emails={[]} />);
    expect(screen.getByTestId("marketing-card")).toHaveTextContent("Autumn launch");
  });

  it("shows a campaign under Email even when the lead has no emails or conversations", async () => {
    render(<LeadTimeline items={items} emails={[]} />);
    await userEvent.click(screen.getByRole("tab", { name: "Email" }));
    expect(screen.getByTestId("marketing-card")).toHaveTextContent("Autumn launch");
    expect(screen.queryByText("No emails linked to this lead yet.")).toBeNull();
    expect(screen.getByText("Showing the latest 500 campaigns")).toBeInTheDocument();
  });
});
