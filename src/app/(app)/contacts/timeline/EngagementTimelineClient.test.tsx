// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { EngagementTimeline } from "@/features/contacts/engagementTimeline";

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

const engagementQuery = vi.fn();
const DATA: EngagementTimeline = {
  months: ["2026-05", "2026-06"],
  lanes: [
    {
      contactId: "p1",
      contactName: "Alice",
      total: 2,
      lastActivityMs: 2,
      byMonth: {
        "2026-05": [
          {
            id: "a1",
            typeKey: "call",
            subject: "Call Alice",
            dueAtIso: "2026-05-10T10:00:00.000Z",
            done: false,
          },
        ],
        "2026-06": [
          {
            id: "a2",
            typeKey: "meeting",
            subject: "Meet Alice",
            dueAtIso: "2026-06-20T10:00:00.000Z",
            done: false,
          },
        ],
      },
    },
    {
      contactId: "p2",
      contactName: "Bob",
      total: 1,
      lastActivityMs: 1,
      byMonth: {
        "2026-06": [
          {
            id: "a3",
            typeKey: "call",
            subject: "Call Bob",
            dueAtIso: "2026-06-05T10:00:00.000Z",
            done: false,
          },
        ],
      },
    },
  ],
};

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    contacts: {
      engagementTimeline: {
        useQuery: (input: unknown) => {
          engagementQuery(input);
          return { data: DATA, isLoading: false, error: null };
        },
      },
    },
    activities: {
      listTypes: {
        useQuery: () => ({
          data: [
            { id: "t1", key: "call", name: "Call" },
            { id: "t2", key: "meeting", name: "Meeting" },
          ],
        }),
      },
    },
    identity: {
      assignableUsers: {
        useQuery: () => ({ data: [{ id: "u1", name: "Ann Owner", avatarUrl: null }] }),
      },
    },
  },
}));

import { EngagementTimelineClient } from "./EngagementTimelineClient";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EngagementTimelineClient", () => {
  it("renders one lane per contact with month-bucketed markers", () => {
    render(<EngagementTimelineClient />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    // Each marker is labelled by its activity subject.
    expect(screen.getByLabelText("Call Alice")).toBeInTheDocument();
    expect(screen.getByLabelText("Meet Alice")).toBeInTheDocument();
    expect(screen.getByLabelText("Call Bob")).toBeInTheDocument();
  });

  it("re-scopes the query to organizations when the entity toggle is clicked", async () => {
    render(<EngagementTimelineClient />);
    fireEvent.click(screen.getByRole("button", { name: "Organizations" }));
    await waitFor(() => {
      const last = engagementQuery.mock.calls.at(-1)?.[0] as { entity: string };
      expect(last.entity).toBe("organization");
    });
  });

  it("re-scopes the query by activity type when a type chip is clicked", async () => {
    render(<EngagementTimelineClient />);
    fireEvent.click(screen.getByRole("button", { name: "Call" }));
    await waitFor(() => {
      const last = engagementQuery.mock.calls.at(-1)?.[0] as { typeKey: string | null };
      expect(last.typeKey).toBe("call");
    });
  });
});
