// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/activities/list",
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const useQuery = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      activities: {
        dayLoad: { invalidate: () => Promise.resolve() },
        listRows: { invalidate: () => Promise.resolve() },
      },
    }),
    activities: {
      listRows: { useQuery: (input?: unknown, opts?: unknown) => useQuery(input, opts) },
      listTypes: { useQuery: () => ({ data: [] }) },
    },
    identity: { assignableUsers: { useQuery: () => ({ data: [] }) } },
  },
}));
vi.mock("./AddActivityModal", () => ({ AddActivityModal: () => null }));
vi.mock("./ActivityEditModal", () => ({ ActivityEditModal: () => null }));
vi.mock("./actions", () => ({
  completeActivityAction: vi.fn(),
  deleteActivityAction: vi.fn(),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "tok" }));

import { ActivitiesTable } from "./ActivitiesTable";
import { noFilter } from "./activityRowsTestHelpers";

const SEED = {
  ...noFilter,
  ownerId: "u1",
  done: "done" as const,
  from: "2026-01-01",
  to: "2026-12-31",
  dateBasis: "done" as const,
  pipelineId: "p1",
};

describe("ActivitiesTable opened from a dashboard tile", () => {
  it("queries the seeded filter on the first render, enabled", () => {
    useQuery.mockReturnValue({ data: [] });
    render(<ActivitiesTable currentUserId="me" initialFilter={SEED} pipelineName="Sales" />);
    expect(useQuery).toHaveBeenNthCalledWith(1, expect.objectContaining(SEED), {
      enabled: true,
    });
  });

  it("sends the browser zone so completed dates are the viewer's local days", () => {
    useQuery.mockReturnValue({ data: [] });
    render(<ActivitiesTable currentUserId="me" initialFilter={SEED} pipelineName="Sales" />);
    expect(useQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      expect.anything(),
    );
  });

  it("shows the pipeline scope and drops it from the query when removed", () => {
    useQuery.mockReturnValue({ data: [] });
    render(<ActivitiesTable currentUserId="me" initialFilter={SEED} pipelineName="Sales" />);
    fireEvent.click(screen.getByRole("button", { name: "Remove pipeline filter" }));
    expect(useQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ pipelineId: null, dateBasis: "done" }),
      expect.anything(),
    );
  });
});
