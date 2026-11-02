// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIGRATION_STRINGS } from "@/constants/migrationStrings";
import { MigrationPage } from "./MigrationPage";

const S = MIGRATION_STRINGS;

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MigrationPage", () => {
  it("leads with the migration H1 and an answer-first summary", () => {
    render(<MigrationPage initialStars={null} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(S.heading);
    expect(screen.getByText(S.summary)).toBeInTheDocument();
  });

  it("lists the import order as an ordered list, in order", () => {
    render(<MigrationPage initialStars={null} />);
    const list = screen.getByRole("list", { name: S.order.heading });
    expect(list.tagName).toBe("OL");
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      ...S.order.items,
    ]);
  });

  it("says what is kept and what does not come across", () => {
    render(<MigrationPage initialStars={null} />);
    for (const item of [...S.kept.items, ...S.notCarried.items]) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
  });

  it("links to the full migration guide in the docs", () => {
    render(<MigrationPage initialStars={null} />);
    expect(screen.getByRole("link", { name: S.guideLabel })).toHaveAttribute(
      "href",
      "https://docs.warpdrivecrm.com/guides/migrating-from-pipedrive/",
    );
  });
});
