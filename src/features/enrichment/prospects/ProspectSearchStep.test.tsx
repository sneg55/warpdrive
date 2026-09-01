// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, renderHook, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { ProspectSearchStep, type ProspectSearchStepProps } from "./ProspectSearchStep";
import type { BadgedProspect } from "./types";
import { useProspectSelection } from "./useProspectSelection";

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

function props(overrides: Partial<ProspectSearchStepProps> = {}): ProspectSearchStepProps {
  const { result } = renderHook(() => useProspectSelection());
  return {
    orgName: "Acme",
    providers: ["apollo"],
    filters: { provider: "apollo", title: "", seniorities: [] },
    profiles: [],
    hasMore: false,
    loading: false,
    loadingMore: false,
    searched: false,
    outcome: null,
    errorId: null,
    selection: result.current,
    onFiltersChange: vi.fn(),
    onSearch: vi.fn(),
    onLoadMore: vi.fn(),
    onReveal: vi.fn(),
    ...overrides,
  };
}

describe("ProspectSearchStep", () => {
  it("shows a busy state while searching rather than an empty table", () => {
    render(<ProspectSearchStep {...props({ loading: true })} />);
    expect(screen.getByLabelText("Searching")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("names the company when the provider found nobody", () => {
    render(
      <ProspectSearchStep
        {...props({ searched: true, outcome: { provider: "apollo", kind: "no_match" } })}
      />,
    );
    expect(screen.getByText("No people found at Acme")).toBeInTheDocument();
  });

  it("asks for a domain rather than showing an empty result", () => {
    render(<ProspectSearchStep {...props({ errorId: ERROR_IDS.ENRICH_ORG_NO_DOMAIN })} />);
    expect(screen.getByText("This organization has no domain")).toBeInTheDocument();
  });

  it("names the provider whose plan excludes search", () => {
    render(
      <ProspectSearchStep
        {...props({ searched: true, outcome: { provider: "apollo", kind: "not_entitled" } })}
      />,
    );
    expect(screen.getByText(/Apollo's plan does not include people search/)).toBeInTheDocument();
  });

  it("renders results once there are any", () => {
    render(<ProspectSearchStep {...props({ searched: true, profiles: profiles(2) })} />);
    expect(screen.getByText("Person 0")).toBeInTheDocument();
    expect(screen.getByText("Person 1")).toBeInTheDocument();
  });

  it("refuses the reveal until something is selected, and says what it costs", () => {
    render(<ProspectSearchStep {...props({ searched: true, profiles: profiles(2) })} />);
    expect(screen.getByRole("button", { name: /Reveal/ })).toBeDisabled();
  });

  it("shows nothing at all before the first search", () => {
    render(<ProspectSearchStep {...props()} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/No people found/)).not.toBeInTheDocument();
  });

  it("does not repeat the dialog subtitle in its own footer", () => {
    render(<ProspectSearchStep {...props()} />);
    expect(
      screen.queryByText("Searching costs nothing. You only spend credits on the people you pick."),
    ).not.toBeInTheDocument();
  });

  it("shows what the provider returned when the search failed outright", () => {
    render(
      <ProspectSearchStep
        {...props({
          searched: true,
          outcome: {
            provider: "apollo",
            kind: "provider_error",
            message: "Provider returned 422",
          },
        })}
      />,
    );
    expect(screen.getByText(/Provider returned 422/)).toBeInTheDocument();
  });
});
