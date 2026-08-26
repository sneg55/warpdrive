// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/contacts/timeline" }));

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  global.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
});

const timelineQuery = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    contacts: { engagementTimeline: { useQuery: () => timelineQuery() } },
    activities: { listTypes: { useQuery: () => ({ data: [] }) } },
    identity: { assignableUsers: { useQuery: () => ({ data: [] }) } },
  },
}));

import { STRINGS } from "@/constants/strings";
import { EngagementTimelineClient } from "./EngagementTimelineClient";

afterEach(cleanup);
beforeEach(() => {
  timelineQuery.mockReset();
});

describe("EngagementTimelineClient loading state", () => {
  it("reserves the grid with a labelled skeleton instead of a bare Loading string", () => {
    timelineQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });
    render(<EngagementTimelineClient />);
    expect(
      screen.getByRole("status", { name: /loading engagement timeline/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).toBeNull();
    expect(screen.queryByText(STRINGS.contacts.timelineEmpty)).toBeNull();
  });

  it("shows the empty copy only once the query resolves with no lanes", () => {
    timelineQuery.mockReturnValue({
      data: { months: [], lanes: [] },
      isLoading: false,
      error: null,
    });
    render(<EngagementTimelineClient />);
    expect(screen.getByText(STRINGS.contacts.timelineEmpty)).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /loading engagement timeline/i })).toBeNull();
  });
});
