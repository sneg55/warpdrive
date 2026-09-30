// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

const mergeDealsAction = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ ok: true as const, deal: { id: "d2" } })),
);
vi.mock("@/features/deal-workspace/mergeDealsAction", () => ({ mergeDealsAction }));
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
const listInputs = vi.hoisted<unknown[]>(() => []);
let searchRefreshesPick = false;
const firstPage = [{ id: "d2", title: "Beta deal", updatedAt: "2026-07-01T00:00:00.000Z" }];
const searchHits = [{ id: "d3", title: "Arkansas deal", updatedAt: "2026-07-03T00:00:00.000Z" }];
const refreshedPick = { id: "d2", title: "Beta deal", updatedAt: "2026-07-09T00:00:00.000Z" };
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    deal: {
      list: {
        useQuery: (input: { definition?: unknown }) => {
          listInputs.push(input);
          const hits = searchHits.concat(searchRefreshesPick ? [refreshedPick] : []);
          return { data: { rows: input.definition === undefined ? firstPage : hits } };
        },
      },
    },
  },
}));
vi.mock("@/components/ui/Combobox", () => ({
  Combobox: ({
    onChange,
    options,
    search,
  }: {
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
    search?: { value: string; onChange: (q: string) => void };
  }) => (
    <div>
      <button type="button" onClick={() => onChange("d2")}>
        pick-source
      </button>
      <button type="button" onClick={() => search?.onChange("Ark")}>
        type-ark
      </button>
      <button type="button" onClick={() => search?.onChange("zzz")}>
        type-zzz
      </button>
      <button type="button" onClick={() => search?.onChange("")}>
        clear-search
      </button>
      <ul>
        {options.map((o) => (
          <li key={o.value}>{o.label}</li>
        ))}
      </ul>
    </div>
  ),
}));
const reportError = vi.fn();
vi.mock("@/features/deal-workspace/DealActionErrorProvider", () => ({
  useDealActionError: () => reportError,
}));

import { MergeDealDialog } from "./MergeDealDialog";

afterEach(() => {
  cleanup();
  listInputs.length = 0;
  searchRefreshesPick = false;
  mergeDealsAction.mockClear();
  replace.mockClear();
  reportError.mockClear();
});

const props = {
  dealId: "d1",
  pipelineId: "p1",
  expectedUpdatedAt: "2026-07-02T00:00:00.000Z",
  open: true,
  onOpenChange: vi.fn(),
};

it("confirming merges this deal into the picked one and replaces the deleted deal's page with it", async () => {
  const user = userEvent.setup();
  render(<MergeDealDialog {...props} />);
  expect(screen.getByText(/merge this deal into/i)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "pick-source" }));
  await user.click(screen.getByRole("button", { name: "Merge" }));
  await waitFor(() =>
    expect(mergeDealsAction).toHaveBeenCalledWith(
      {
        targetDealId: "d2",
        sourceDealId: "d1",
        expectedTargetUpdatedAt: "2026-07-01T00:00:00.000Z",
        expectedSourceUpdatedAt: "2026-07-02T00:00:00.000Z",
      },
      "csrf",
    ),
  );
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/deals/d2"));
});

it("surfaces the error and does not refresh when the merge is denied", async () => {
  mergeDealsAction.mockResolvedValueOnce({
    ok: false as const,
    error: { id: "E_PERM_001" },
  } as never);
  const user = userEvent.setup();
  render(<MergeDealDialog {...props} />);
  await user.click(screen.getByRole("button", { name: "pick-source" }));
  await user.click(screen.getByRole("button", { name: "Merge" }));
  await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
  expect(replace).not.toHaveBeenCalled();
});

it("asks the server for deals whose title contains the typed text", async () => {
  const user = userEvent.setup();
  render(<MergeDealDialog {...props} />);
  await user.click(screen.getByRole("button", { name: "type-ark" }));
  await waitFor(() =>
    expect(listInputs).toContainEqual(
      expect.objectContaining({
        pipelineId: "p1",
        definition: expect.objectContaining({
          conditions: [{ field: "title", op: "contains", value: "Ark" }],
        }),
      }),
    ),
  );
  expect(await screen.findByText("Arkansas deal")).toBeInTheDocument();
});

it("keeps the picked deal when a later search no longer returns it", async () => {
  const user = userEvent.setup();
  render(<MergeDealDialog {...props} />);
  await user.click(screen.getByRole("button", { name: "pick-source" }));
  await user.click(screen.getByRole("button", { name: "type-ark" }));
  expect(await screen.findByText("Arkansas deal")).toBeInTheDocument();
  expect(screen.getByText("Beta deal")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Merge" }));
  await waitFor(() =>
    expect(mergeDealsAction).toHaveBeenCalledWith(
      expect.objectContaining({ targetDealId: "d2" }),
      "csrf",
    ),
  );
});

it("merges into the picked deal's freshest updatedAt when a later search returns it again", async () => {
  searchRefreshesPick = true;
  const user = userEvent.setup();
  render(<MergeDealDialog {...props} />);
  await user.click(screen.getByRole("button", { name: "pick-source" }));
  await user.click(screen.getByRole("button", { name: "type-ark" }));
  expect(await screen.findByText("Arkansas deal")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Merge" }));
  await waitFor(() =>
    expect(mergeDealsAction).toHaveBeenCalledWith(
      expect.objectContaining({
        targetDealId: "d2",
        expectedTargetUpdatedAt: "2026-07-09T00:00:00.000Z",
      }),
      "csrf",
    ),
  );
});

it("keeps the refreshed updatedAt after a later search drops the picked deal again", async () => {
  searchRefreshesPick = true;
  const user = userEvent.setup();
  render(<MergeDealDialog {...props} />);
  await user.click(screen.getByRole("button", { name: "pick-source" }));
  await user.click(screen.getByRole("button", { name: "type-ark" }));
  expect(await screen.findByText("Arkansas deal")).toBeInTheDocument();
  searchRefreshesPick = false;
  await user.click(screen.getByRole("button", { name: "type-zzz" }));
  await waitFor(() => expect(listInputs.length).toBeGreaterThan(2));
  await user.click(screen.getByRole("button", { name: "Merge" }));
  await waitFor(() =>
    expect(mergeDealsAction).toHaveBeenCalledWith(
      expect.objectContaining({
        targetDealId: "d2",
        expectedTargetUpdatedAt: "2026-07-09T00:00:00.000Z",
      }),
      "csrf",
    ),
  );
});

it("does not roll the pick back to an older row when an earlier page shows again", async () => {
  searchRefreshesPick = true;
  const user = userEvent.setup();
  render(<MergeDealDialog {...props} />);
  await user.click(screen.getByRole("button", { name: "pick-source" }));
  await user.click(screen.getByRole("button", { name: "type-ark" }));
  expect(await screen.findByText("Arkansas deal")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "clear-search" }));
  await waitFor(() => expect(screen.queryByText("Arkansas deal")).toBeNull());
  await user.click(screen.getByRole("button", { name: "Merge" }));
  await waitFor(() =>
    expect(mergeDealsAction).toHaveBeenCalledWith(
      expect.objectContaining({
        targetDealId: "d2",
        expectedTargetUpdatedAt: "2026-07-09T00:00:00.000Z",
      }),
      "csrf",
    ),
  );
});
