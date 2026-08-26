// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { BoardCard } from "./dealRepo";

vi.mock("./useBoardRealtime", () => ({ useBoardRealtime: () => {} }));
vi.mock("@/features/presence/ui/PresenceBar", () => ({ PresenceBar: () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => "/pipeline",
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      client: { deal: { board: { query: vi.fn() } } },
      deal: { savedFilters: { invalidate: vi.fn() } },
    }),
    deal: { savedFilters: { useQuery: () => ({ data: [] }) } },
    identity: { assignableUsers: { useQuery: () => ({ data: [] }) } },
    labels: { listByTarget: { useQuery: () => ({ data: [] }) } },
  },
}));
vi.mock("@/features/identity/preferencesActions", () => ({
  setBoardViewAction: () => Promise.resolve({ ok: true }),
}));

import { Board } from "./Board";

const PIPE = "11111111-1111-1111-1111-111111111111";
const SERVER_NOW = new Date("2026-08-25T12:00:00Z");

const STAGES = [
  { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "Alpha", order: 0, rottingDays: 14 },
];

function rottenCard(): BoardCard {
  return {
    id: "dddddddd-0000-0000-0000-000000000009",
    title: "annual contract deal #47",
    value: "58000.00",
    stageId: STAGES[0]!.id,
    boardPosition: "1",
    ownerId: "22222222-2222-2222-2222-222222222222",
    personId: null,
    orgId: null,
    // Due three calendar days before SERVER_NOW, so it is unambiguously overdue.
    nextActivityAt: new Date("2026-08-22T09:00:00Z"),
    nextActivityTitle: "Discovery call",
    lastActivityAt: null,
    // 37 days in stage against a 14-day threshold, so it is well past rotting.
    stageEnteredAt: new Date("2026-07-19T12:00:00Z"),
    updatedAt: new Date("2026-07-19T12:00:00Z"),
  };
}

// The server render is the user's first paint. It must not describe an overdue deal as having
// nothing scheduled: effects have not run yet, so anything derived from a mount-only clock is
// a factual claim made before the data exists.
function ssr(): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <Board
        pipelineId={PIPE}
        selfActorId="22222222-2222-2222-2222-222222222222"
        stages={STAGES}
        cards={[rottenCard()]}
        pipelines={[{ id: PIPE, name: "Test pipeline", stages: [] }]}
        density="comfortable"
        serverNow={SERVER_NOW}
      />
    </QueryClientProvider>,
  );
}

describe("Board first paint", () => {
  test("describes an overdue activity as overdue, not as nothing scheduled", () => {
    const html = ssr();
    expect(html).toContain("3 days overdue");
    expect(html).not.toContain("No activity scheduled");
  });

  // data-activity, not a colour class: this must keep holding when the palette changes.
  test("marks the badge overdue on the server render", () => {
    expect(ssr()).toContain('data-activity="overdue"');
  });

  test("renders the rot tint for a deal past its stage threshold", () => {
    expect(ssr()).toContain("border-l-4");
  });
});
