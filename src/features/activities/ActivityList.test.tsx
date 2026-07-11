// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const complete = vi.fn<
  (input: { id: string; done: boolean }) => Promise<{ ok: boolean; value: { id: string } }>
>(() => Promise.resolve({ ok: true, value: { id: "a1" } }));
vi.mock("./actions", () => ({
  completeActivityAction: (input: { id: string; done: boolean }) => complete(input),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "tok" }));

import { ActivityList, type ActivityRow } from "./ActivityList";

afterEach(() => {
  cleanup();
  complete.mockClear();
});

const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

const items: ActivityRow[] = [
  {
    id: "a1",
    subject: "Call Acme",
    dueAtIso: iso(-3),
    typeKey: "call",
    done: false,
    dealId: "d1",
    personId: null,
    orgId: null,
  },
  {
    id: "a2",
    subject: "Prep deck",
    dueAtIso: iso(5),
    typeKey: "task",
    done: false,
    dealId: null,
    personId: null,
    orgId: null,
  },
];

describe("ActivityList", () => {
  it("groups activities and links to the related record", () => {
    render(<ActivityList items={items} now={Date.now()} />);
    expect(screen.getByRole("region", { name: "Overdue" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Upcoming" })).toBeInTheDocument();
    // The overdue Call links to its deal.
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/deals/d1");
  });

  it("completes an activity when its checkbox is toggled", () => {
    render(<ActivityList items={items} now={Date.now()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: 'Mark "Call Acme" done' }));
    expect(complete).toHaveBeenCalledWith({ id: "a1", done: true });
  });
});
