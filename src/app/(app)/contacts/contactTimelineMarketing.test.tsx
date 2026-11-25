// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarketingCampaignItem } from "@/features/brevo/types";

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    intercom: { list: { useQuery: () => ({ data: undefined }) } },
    contacts: { contactTimeline: { useQuery: () => ({ data: { items: [] } }) } },
    email: { listMessagesForContact: { useQuery: () => ({ data: [], isError: false }) } },
    files: { listForEntity: { useQuery: () => ({ data: [] }) } },
    useUtils: () => ({}),
  },
}));
const hookScope = vi.fn();
vi.mock("@/features/brevo/useMarketingCampaigns", () => ({
  useMarketingCampaigns: (scope: unknown) => {
    hookScope(scope);
    const items: MarketingCampaignItem[] =
      scope === null
        ? []
        : [
            {
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
            },
          ];
    return { items, truncated: false };
  },
}));
vi.mock("@/features/brevo/MarketingCampaignCard", () => ({
  MarketingCampaignCard: ({ campaign }: { campaign: MarketingCampaignItem }) => (
    <div data-testid="marketing-card">{campaign.campaignName}</div>
  ),
}));

import { ContactTimelinePanel } from "./contactDetail.shared";

afterEach(cleanup);

describe("person timeline marketing campaigns", () => {
  it("lists the person's campaigns under Email and counts them", async () => {
    render(<ContactTimelinePanel entityType="person" entityId="p1" />);
    expect(hookScope).toHaveBeenCalledWith({ kind: "person", personId: "p1" });
    await userEvent.click(screen.getByRole("tab", { name: "Email (1)" }));
    expect(screen.getByTestId("marketing-card")).toHaveTextContent("Autumn launch");
  });

  it("asks for nothing on an organization", () => {
    render(<ContactTimelinePanel entityType="organization" entityId="o1" />);
    expect(hookScope).toHaveBeenLastCalledWith(null);
    expect(screen.queryByTestId("marketing-card")).toBeNull();
  });
});
