// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

import { DealCard } from "./DealCard";
import { baseCard } from "./dealCardTestFixture";

describe("DealCard", () => {
  it("renders the title with a draggable roledescription", () => {
    render(
      <DealCard
        card={baseCard}
        ownerName="A.K."
        personName="Jane Roe"
        orgName="Acme Inc"
        labels={[]}
        rottingDays={null}
        density="comfortable"
        now={new Date("2026-06-10T00:00:00Z")}
      />,
    );
    const card = screen.getByRole("button", { name: /Acme renewal/ });
    expect(card.getAttribute("aria-roledescription")).toBe("draggable deal card");
  });

  it("shows a colored owner avatar with initials (Pipedrive parity, not muted gray)", () => {
    render(
      <DealCard
        card={baseCard}
        ownerName="Ada King"
        personName={null}
        orgName={null}
        labels={[]}
        rottingDays={null}
        density="comfortable"
        now={new Date("2026-06-10T00:00:00Z")}
      />,
    );
    const avatar = screen.getByRole("img", { name: "owner: Ada King" });
    // Two-letter initials, not a single first char.
    expect(avatar.textContent).toBe("AK");
    // A palette swatch (bg-*-100), not the muted bg-secondary.
    expect(avatar.className).toMatch(/bg-\w+-100/);
    expect(avatar.className).not.toContain("bg-secondary");
  });

  it("renders the owner's uploaded photo instead of initials when ownerAvatarUrl is set", () => {
    render(
      <DealCard
        card={baseCard}
        ownerName="Ada King"
        ownerAvatarUrl="/api/users/u1/avatar?v=1"
        personName={null}
        orgName={null}
        labels={[]}
        rottingDays={null}
        density="comfortable"
        now={new Date("2026-06-10T00:00:00Z")}
      />,
    );
    const img = screen.getByRole("img", { name: "owner: Ada King" });
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toBe("/api/users/u1/avatar?v=1");
    // No initials span when a photo is shown.
    expect(img.textContent).toBe("");
  });

  it("applies a lifted shadow when elevated (drag overlay, Pipedrive)", () => {
    render(
      <DealCard
        card={baseCard}
        ownerName="A.K."
        personName={null}
        orgName={null}
        labels={[]}
        rottingDays={null}
        density="comfortable"
        now={new Date("2026-06-10T00:00:00Z")}
        elevated
      />,
    );
    const card = screen.getByRole("button", { name: /Acme renewal/ });
    expect(card.className).toContain("shadow-2xl");
  });

  it("calls onOpen when the card is clicked (opens the deal, Pipedrive parity)", () => {
    const onOpen = vi.fn();
    render(
      <DealCard
        card={baseCard}
        ownerName="A.K."
        personName={null}
        orgName={null}
        labels={[]}
        rottingDays={null}
        density="comfortable"
        now={new Date("2026-06-10T00:00:00Z")}
        onOpen={onOpen}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Acme renewal/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("leads with the deal title and shows 'org, person' as the description (Pipedrive parity)", () => {
    render(
      <DealCard
        card={baseCard}
        ownerName="A.K."
        personName="Jane Roe"
        orgName="Acme Inc"
        labels={[]}
        rottingDays={null}
        density="comfortable"
        now={new Date("2026-06-10T00:00:00Z")}
      />,
    );
    // Primary (bold) line is the deal title; the gray description is "org, person".
    expect(screen.getByText("Acme renewal")).toBeTruthy();
    expect(screen.getByText("Acme Inc, Jane Roe")).toBeTruthy();
  });

  it("shows just the org in the description when there is no person", () => {
    render(
      <DealCard
        card={baseCard}
        ownerName="A.K."
        personName={null}
        orgName="Acme Inc"
        labels={[]}
        rottingDays={null}
        density="comfortable"
        now={new Date("2026-06-10T00:00:00Z")}
      />,
    );
    expect(screen.getByText("Acme renewal")).toBeTruthy();
    expect(screen.getByText("Acme Inc")).toBeTruthy();
    // No trailing comma when the person is absent.
    expect(screen.queryByText(/Acme Inc,/)).toBeNull();
  });

  it("shows just the person in the description when there is no org", () => {
    render(
      <DealCard
        card={baseCard}
        ownerName="A.K."
        personName="Jane Roe"
        orgName={null}
        labels={[]}
        rottingDays={null}
        density="comfortable"
        now={new Date("2026-06-10T00:00:00Z")}
      />,
    );
    expect(screen.getByText("Acme renewal")).toBeTruthy();
    expect(screen.getByText("Jane Roe")).toBeTruthy();
  });

  it("renders value and label chip", () => {
    render(
      <DealCard
        card={baseCard}
        ownerName="A.K."
        personName="Jane Roe"
        orgName="Acme Inc"
        labels={[{ name: "Hot", color: "#ef4444" }]}
        rottingDays={null}
        density="comfortable"
        now={new Date("2026-06-10T00:00:00Z")}
      />,
    );
    // Value is rendered as formatted currency (whole dollars), not the raw decimal string.
    expect(screen.getByText("$25,000")).toBeTruthy();
    expect(screen.getByText("Hot")).toBeTruthy();
  });

  it("shows a rotting badge with text when idle past the threshold", () => {
    render(
      <DealCard
        card={baseCard}
        ownerName="A.K."
        personName={null}
        orgName={null}
        labels={[]}
        rottingDays={5}
        density="comfortable"
        now={new Date("2026-06-20T00:00:00Z")}
      />,
    );
    expect(screen.getByText(/19d/)).toBeTruthy();
    expect(screen.getByLabelText(/rotting/i)).toBeTruthy();
  });

  it("hides the description line in compact density but keeps the deal-title primary line", () => {
    render(
      <DealCard
        card={baseCard}
        ownerName="A.K."
        personName="Jane Roe"
        orgName="Acme Inc"
        labels={[]}
        rottingDays={null}
        density="compact"
        now={new Date("2026-06-10T00:00:00Z")}
      />,
    );
    // The deal title is the always-visible primary line; the "org, person" description is hidden.
    expect(screen.getByText("Acme renewal")).toBeTruthy();
    expect(screen.queryByText("Acme Inc, Jane Roe")).toBeNull();
  });
});
