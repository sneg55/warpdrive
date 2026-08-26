// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

type ActionResult = { ok: true; value: { id: string } } | { ok: false; error: { id: string } };
const complete = vi.fn<(input: { id: string; done: boolean }) => Promise<ActionResult>>();
vi.mock("./actions", () => ({
  completeActivityAction: (input: { id: string; done: boolean }) => complete(input),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "tok" }));

const reportError = vi.fn();
vi.mock("@/components/shell/ActionErrorProvider", () => ({ useActionError: () => reportError }));

import { ActivityList, type ActivityRow } from "./ActivityList";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const items: ActivityRow[] = [
  {
    id: "a1",
    subject: "Call Acme",
    dueAtIso: new Date("2026-08-20T10:00:00.000Z").toISOString(),
    typeKey: "call",
    done: false,
    dealId: "d1",
    personId: null,
    orgId: null,
  },
];

const NOW = new Date("2026-08-24T10:00:00.000Z").getTime();

describe("ActivityList done checkbox failure", () => {
  // Same silent-swallow regression as ActivitiesTable: this surface fired the action and ignored
  // the Result entirely, so a rejected completion refreshed the page back to the unchecked box.
  it("reports the error id when marking done fails", async () => {
    complete.mockResolvedValue({ ok: false, error: { id: "E_PERM_001" } });
    render(<ActivityList items={items} now={NOW} />);

    fireEvent.click(screen.getByRole("checkbox", { name: 'Mark "Call Acme" done' }));

    await waitFor(() => {
      expect(reportError).toHaveBeenCalledWith("E_PERM_001");
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes and reports nothing when marking done succeeds", async () => {
    complete.mockResolvedValue({ ok: true, value: { id: "a1" } });
    render(<ActivityList items={items} now={NOW} />);

    fireEvent.click(screen.getByRole("checkbox", { name: 'Mark "Call Acme" done' }));

    await waitFor(() => {
      expect(refresh).toHaveBeenCalled();
    });
    expect(reportError).not.toHaveBeenCalled();
  });
});
