// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

let signaturesData: { id: string; name: string; isDefault?: boolean }[] = [];

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ email: { templates: { list: { invalidate: () => undefined } } } }),
    email: {
      templates: {
        list: { useQuery: () => ({ data: [] }) },
        get: { useQuery: () => ({ data: undefined }) },
      },
      mergeContext: { useQuery: () => ({ data: {}, isPending: false }) },
      signatures: { list: { useQuery: () => ({ data: signaturesData }) } },
    },
    contacts: {
      listPeople: { useQuery: () => ({ data: { rows: [], total: 0 } }) },
      searchRecipients: { useQuery: () => ({ data: [] }) },
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
    await user.hover(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Signature: None");

    await user.unhover(trigger);

    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: "Work" }));

    await user.hover(trigger);
    await waitFor(() =>
      expect(screen.getAllByRole("tooltip").map((t) => t.textContent)).toContain("Signature: Work"),
    );
  });
});
