// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProspectResultsTable } from "./ProspectResultsTable";
import type { BadgedProspect } from "./types";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

afterEach(cleanup);

function profiles(count: number): BadgedProspect[] {
  return Array.from({ length: count }, (_, i) => ({
    providerRef: `p${i}`,
    fullName: `Person ${i}`,
    hasEmail: true,
    hasPhone: false,
    match: { kind: "new" as const },
  }));
}

const noop = (): void => undefined;

describe("ProspectResultsTable", () => {
  it("leaves the header unchecked when nothing on the page is picked", () => {
    render(
      <ProspectResultsTable
        profiles={profiles(3)}
        isSelected={() => false}
        selectionFull={false}
        hasMore={false}
        loadingMore={false}
        onToggle={noop}
        onTogglePage={noop}
        onLoadMore={noop}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Select everyone on this page" })).toHaveAttribute(
      "data-state",
      "unchecked",
    );
  });

  it("shows the header as mixed when only some of the page is picked", () => {
    render(
      <ProspectResultsTable
        profiles={profiles(3)}
        isSelected={(ref) => ref === "p0"}
        selectionFull={false}
        hasMore={false}
        loadingMore={false}
        onToggle={noop}
        onTogglePage={noop}
        onLoadMore={noop}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Select everyone on this page" })).toHaveAttribute(
      "data-state",
      "indeterminate",
    );
  });

  it("disables only the unpicked rows once the selection is full", () => {
    render(
      <ProspectResultsTable
        profiles={profiles(2)}
        isSelected={(ref) => ref === "p0"}
        selectionFull={true}
        hasMore={false}
        loadingMore={false}
        onToggle={noop}
        onTogglePage={noop}
        onLoadMore={noop}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Person 0" })).not.toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Person 1" })).toBeDisabled();
  });

  it("offers load more only when the provider says there is more", () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <ProspectResultsTable
        profiles={profiles(1)}
        isSelected={() => false}
        selectionFull={false}
        hasMore={false}
        loadingMore={false}
        onToggle={noop}
        onTogglePage={noop}
        onLoadMore={onLoadMore}
      />,
    );
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    rerender(
      <ProspectResultsTable
        profiles={profiles(1)}
        isSelected={() => false}
        selectionFull={false}
        hasMore={true}
        loadingMore={false}
        onToggle={noop}
        onTogglePage={noop}
        onLoadMore={onLoadMore}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("scrolls the results inside their own container rather than the page", () => {
    const { container } = render(
      <ProspectResultsTable
        profiles={profiles(1)}
        isSelected={() => false}
        selectionFull={false}
        hasMore={false}
        loadingMore={false}
        onToggle={noop}
        onTogglePage={noop}
        onLoadMore={noop}
      />,
    );
    expect(container.querySelector(".overflow-y-auto")).not.toBeNull();
  });
});
