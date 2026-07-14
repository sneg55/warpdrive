// @vitest-environment jsdom
// Task 4 (inbox-compose parity): the signature picker moves from the composer footer's
// conditional render into a toolbar control that is always present, even with zero
// signatures (PD offers a "None" choice before any default is chosen).
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

// Mutable fixture read by the mocked signatures query so each test controls its own data
// without re-declaring the whole trpc mock module per test file.
let signaturesData: { id: string; name: string; isDefault?: boolean }[] = [];

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ email: { templates: { list: { invalidate: () => undefined } } } }),
    email: {
      templates: {
        list: { useQuery: () => ({ data: [] }) },
        get: { useQuery: () => ({ data: undefined }) },
      },
      signatures: { list: { useQuery: () => ({ data: signaturesData }) } },
    },
    contacts: {
      listPeople: { useQuery: () => ({ data: { rows: [], total: 0 } }) },
    },
    activities: {
      listTypes: { useQuery: () => ({ data: [] }) },
    },
  },
}));

vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

vi.mock("@/features/activities/actions", () => ({
  createActivityAction: () => Promise.resolve({ ok: true, value: { id: "act-stub" } }),
  completeActivityAction: () => Promise.resolve({ ok: true, value: { id: "act-stub" } }),
}));

vi.mock("@/features/email/actions", () => ({
  sendEmail: () => Promise.resolve({ ok: true }),
}));

import { Composer } from "./Composer";

// The signature control must live in the toolbar row (next to the template / insert-field
// controls), not just be present somewhere in the composer, so assertions are scoped to that row.
// Anchor on "Insert field" and walk up to the row that also holds the Signature trigger.
function getToolbarRow(): HTMLElement {
  const insertField = screen.getByRole("button", { name: /insert field/i });
  let el: HTMLElement | null = insertField.parentElement;
  while (el !== null && within(el).queryByRole("button", { name: /^signature$/i }) === null) {
    el = el.parentElement;
  }
  return el as HTMLElement;
}

describe("Composer toolbar signature picker (Task 4)", () => {
  it("renders in the toolbar row next to the template/insert controls, even with zero signatures", () => {
    signaturesData = [];
    render(<Composer accountId="a1" context={{ kind: "inbox" }} />);
    const toolbarRow = getToolbarRow();
    expect(within(toolbarRow).getByRole("button", { name: /^signature$/i })).toBeInTheDocument();
  });

  it("selecting a signature from a non-empty list in the toolbar applies it", async () => {
    signaturesData = [{ id: "s1", name: "Work" }];
    const user = userEvent.setup();
    render(<Composer accountId="a1" context={{ kind: "inbox" }} />);
    const toolbarRow = getToolbarRow();
    const trigger = within(toolbarRow).getByRole("button", { name: /^signature$/i });
    // The current-signature hint moved from a native title= to the Tooltip label.
    await user.hover(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Signature: None");
    await user.unhover(trigger);

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Work" }));

    await user.hover(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Signature: Work");
  });
});
