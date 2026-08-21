// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const deleteMock = vi.fn(() => Promise.resolve({ ok: true, value: { id: "d1" } }));
vi.mock("./folderActions", () => ({
  deleteDraftAction: (...a: unknown[]) => deleteMock(...(a as [])),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/components/shell/ActionErrorProvider", () => ({
  useActionError: () => vi.fn(),
}));

import type { DraftSummary } from "./draftRepo";
import { EmailDraftCard } from "./EmailDraftCard";

afterEach(cleanup);

const draft = (over: Partial<DraftSummary> = {}): DraftSummary => ({
  id: "d1",
  subject: "Outreach",
  bodyHtml: "<p>hi</p>",
  toEmails: ["poc@example.com"],
  ccEmails: [],
  threadId: null,
  accountId: "acct-1",
  visibility: "shared",
  linkDealId: "deal-1",
  linkPersonId: null,
  updatedAt: "2026-08-04T10:00:00Z",
  ...over,
});

describe("EmailDraftCard", () => {
  it("marks the row as a draft and shows subject and recipients", () => {
    render(<EmailDraftCard draft={draft()} onResume={vi.fn()} onChanged={vi.fn()} />);

    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Outreach")).toBeInTheDocument();
    expect(screen.getByText(/poc@example.com/)).toBeInTheDocument();
  });

  it("labels a subject-less draft rather than rendering an empty row", () => {
    render(
      <EmailDraftCard draft={draft({ subject: "" })} onResume={vi.fn()} onChanged={vi.fn()} />,
    );

    expect(screen.getByText("(no subject)")).toBeInTheDocument();
  });

  it("hands the draft back on Continue so the composer can resume it", async () => {
    const onResume = vi.fn();
    const d = draft();
    render(<EmailDraftCard draft={d} onResume={onResume} onChanged={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(onResume).toHaveBeenCalledWith(d);
  });

  it("deletes only after the confirmation is affirmed", async () => {
    const onChanged = vi.fn();
    render(<EmailDraftCard draft={draft()} onResume={vi.fn()} onChanged={onChanged} />);

    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(deleteMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Discard draft" }));

    expect(deleteMock).toHaveBeenCalledWith("csrf", { draftId: "d1" });
    expect(onChanged).toHaveBeenCalled();
  });

  // Surfaces with no composer (a timeline that cannot open one) must not offer a Continue that
  // goes nowhere; the row still shows, because an unsent draft is worth knowing about.
  it("hides Continue when the surface cannot resume a draft", () => {
    render(<EmailDraftCard draft={draft()} onChanged={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    expect(screen.getByText("Outreach")).toBeInTheDocument();
  });
});
