// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { SupportScope } from "@/features/intercom/supportTypes";
import { MarketingCampaignCard } from "./MarketingCampaignCard";
import type { MarketingCampaignItem } from "./types";

const dealScope: SupportScope = { kind: "deal", dealId: "d1" };
const personScope: SupportScope = { kind: "person", personId: "p1" };

function item(over: Partial<MarketingCampaignItem> = {}): MarketingCampaignItem {
  return {
    campaignId: 7,
    campaignName: "Autumn launch",
    subject: "Meet the new dashboard",
    recipientEmail: "pat@example.com",
    recipientPersonId: "p1",
    at: "2026-10-01T10:00:00.000Z",
    sentAt: "2026-10-01T10:00:00.000Z",
    deliveredAt: null,
    firstOpenedAt: null,
    firstClickedAt: null,
    clickedUrls: [],
    hardBouncedAt: null,
    softBouncedAt: null,
    complainedAt: null,
    unsubscribedAt: null,
    ...over,
  };
}

afterEach(cleanup);

describe("MarketingCampaignCard", () => {
  it("shows the campaign name and the subject below it", () => {
    render(<MarketingCampaignCard campaign={item()} scope={personScope} />);
    expect(screen.getByRole("heading", { name: "Autumn launch" })).toBeInTheDocument();
    expect(screen.getByText("Meet the new dashboard")).toBeInTheDocument();
  });

  it("renders only the badges that have a timestamp, in the fixed order", () => {
    render(
      <MarketingCampaignCard
        campaign={item({
          unsubscribedAt: "2026-10-04T10:00:00.000Z",
          firstOpenedAt: "2026-10-02T10:00:00.000Z",
          deliveredAt: "2026-10-01T10:00:05.000Z",
          hardBouncedAt: "2026-10-03T10:00:00.000Z",
        })}
        scope={personScope}
      />,
    );
    const labels = screen.getAllByTestId("campaign-status").map((el) => el.textContent);
    expect(labels).toEqual(["Delivered", "Opened", "Hard bounce", "Unsubscribed"]);
    expect(screen.queryByText("Clicked")).not.toBeInTheDocument();
    expect(screen.queryByText("Spam complaint")).not.toBeInTheDocument();
  });

  it("renders no badges for a campaign with no status timestamps", () => {
    render(<MarketingCampaignCard campaign={item()} scope={personScope} />);
    expect(screen.queryAllByTestId("campaign-status")).toHaveLength(0);
  });

  it("shows the recipient on deal and lead scopes but not on the person scope", () => {
    const { rerender } = render(<MarketingCampaignCard campaign={item()} scope={dealScope} />);
    expect(screen.getByText(/pat@example.com/)).toBeInTheDocument();
    rerender(<MarketingCampaignCard campaign={item()} scope={{ kind: "lead", leadId: "l1" }} />);
    expect(screen.getByText(/pat@example.com/)).toBeInTheDocument();
    rerender(<MarketingCampaignCard campaign={item()} scope={personScope} />);
    expect(screen.queryByText(/pat@example.com/)).not.toBeInTheDocument();
  });

  it("lists clicked urls on expand as links that open in a new tab", async () => {
    render(
      <MarketingCampaignCard
        campaign={item({
          firstClickedAt: "2026-10-02T10:00:00.000Z",
          clickedUrls: ["https://a.test/pricing", "javascript:alert(1)"],
        })}
        scope={personScope}
      />,
    );
    expect(screen.queryByText("https://a.test/pricing")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /clicked links/i }));
    const link = screen.getByRole("link", { name: "https://a.test/pricing" });
    expect(link).toHaveAttribute("href", "https://a.test/pricing");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.queryByRole("link", { name: "javascript:alert(1)" })).not.toBeInTheDocument();
    expect(screen.getByText("javascript:alert(1)")).toBeInTheDocument();
  });

  it("has no disclosure when nothing was clicked", () => {
    render(<MarketingCampaignCard campaign={item()} scope={personScope} />);
    expect(screen.queryByRole("button", { name: /clicked links/i })).not.toBeInTheDocument();
  });
});
