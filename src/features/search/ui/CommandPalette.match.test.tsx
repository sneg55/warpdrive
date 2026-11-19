// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: { search: { query: { useQuery: vi.fn() } } },
}));

import { SearchResultsList } from "./CommandPalette";

afterEach(cleanup);

const EMPTY = { people: [], organizations: [], leads: [] };

describe("SearchResultsList content hits", () => {
  it("renders the source and snippet under a content hit", () => {
    render(
      <SearchResultsList
        results={{
          ...EMPTY,
          deals: [
            {
              id: "d1",
              primary: "Maya (Prop Desk)",
              secondary: "",
              match: {
                source: "intercom",
                label: "Intercom",
                snippet: "…code PROPDESK in our affiliate dashboard…",
              },
            },
          ],
        }}
        onSelect={() => {}}
      />,
    );
    expect(
      screen.getByText("Intercom · …code PROPDESK in our affiliate dashboard…"),
    ).toBeInTheDocument();
  });

  it("uses the custom field name as the label", () => {
    render(
      <SearchResultsList
        results={{
          ...EMPTY,
          deals: [
            {
              id: "d1",
              primary: "Deal",
              secondary: null,
              match: { source: "custom_field", label: "Referral code", snippet: "ABC-1" },
            },
          ],
        }}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText("Referral code · ABC-1")).toBeInTheDocument();
  });

  it("adds no second line for a field hit", () => {
    render(
      <SearchResultsList
        results={{
          ...EMPTY,
          deals: [{ id: "d1", primary: "Deal", secondary: null, match: null }],
        }}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("option").textContent).toBe("Deal");
  });
});
