// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarketingCampaignItem } from "@/features/brevo/types";
import type { HistoryItem } from "./historyTimeline";

vi.mock("@/features/brevo/MarketingCampaignCard", () => ({
  MarketingCampaignCard: ({ campaign }: { campaign: MarketingCampaignItem }) => (
    <div data-testid="marketing-card">{campaign.campaignName}</div>
  ),
}));

import { HistoryFeed } from "./HistoryFeed";

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

describe("HistoryFeed with marketing campaigns", () => {
  it("renders the card on a surface without an email scope, with its own rail icon", () => {
    const { container } = render(<HistoryFeed items={items} emptyLabel="Nothing" />);
    expect(screen.getByTestId("marketing-card")).toHaveTextContent("Autumn launch");
    expect(container.querySelector('[data-rail="marketing"]')).not.toBeNull();
  });

  it("ends the feed with the truncation line", () => {
    render(<HistoryFeed items={items} emptyLabel="Nothing" />);
    expect(screen.getByText("Showing the latest 500 campaigns")).toBeInTheDocument();
  });
});
