// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { formatCreatedOn } from "./formatDate";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

const reportError = vi.fn();
vi.mock("@/components/shell/ActionErrorProvider", () => ({
  useActionError: () => reportError,
}));

// RichTextBody arrives via next/dynamic (a tick after the editor chrome); surface both the seeded
// html and the inserted merge token so the T1 assertion can observe the {{token}} insertion.
vi.mock("@/features/email/composer/RichTextBody", () => ({
  RichTextBody: ({
    html,
    insertToken,
  }: {
    html: string;
    insertToken?: { text: string; seq: number };
  }) => (
    <div data-testid="rte">
      <span>{html}</span>
      <span data-testid="inserted">{insertToken?.text ?? ""}</span>
    </div>
  ),
}));

const createTemplateAction = vi.fn(() => Promise.resolve({ ok: true, value: { id: "t9" } }));
const updateTemplateAction = vi.fn(() => Promise.resolve({ ok: true, value: undefined }));
const deleteTemplateAction = vi.fn(() => Promise.resolve({ ok: true, value: undefined }));
const deleteTemplatesAction = vi.fn(() => Promise.resolve({ ok: true, value: { deleted: 1 } }));
const reorderTemplatesAction = vi.fn(() => Promise.resolve({ ok: true, value: { reordered: 2 } }));
vi.mock("@/features/email/authoringActions", () => ({
  createTemplateAction: (...a: unknown[]) => createTemplateAction(...(a as [])),
  updateTemplateAction: (...a: unknown[]) => updateTemplateAction(...(a as [])),
  deleteTemplateAction: (...a: unknown[]) => deleteTemplateAction(...(a as [])),
  deleteTemplatesAction: (...a: unknown[]) => deleteTemplatesAction(...(a as [])),
  reorderTemplatesAction: (...a: unknown[]) => reorderTemplatesAction(...(a as [])),
}));

import { TemplatesSettingsClient } from "./TemplatesSettingsClient";

const own = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Mine",
  subject: "S",
  bodyHtml: "<p>m</p>",
  isShared: false,
  isOwn: true,
  ownerName: "Nick",
  createdAt: "2026-01-02T00:00:00.000Z",
};
const shared = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "Theirs",
  subject: null,
  bodyHtml: "<p>s</p>",
  isShared: true,
  isOwn: false,
  ownerName: "Ada",
  createdAt: "2026-03-04T00:00:00.000Z",
};

describe("TemplatesSettingsClient", () => {
  it("lists own and shared; edit/delete only on own rows", () => {
    render(<TemplatesSettingsClient templates={[own, shared]} canShare={true} />);
    expect(screen.getByText("Mine")).toBeInTheDocument();
    expect(screen.getByText("Theirs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete Mine/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete Theirs/i })).not.toBeInTheDocument();
  });

  it("T4a: renders Created-on and Owner columns (You for own, name for shared)", () => {
    render(<TemplatesSettingsClient templates={[own, shared]} canShare={true} />);
    expect(screen.getByText(formatCreatedOn(own.createdAt))).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
  });

  it("T2: search filters rows by name (case-insensitive); no match shows empty copy", async () => {
    const user = userEvent.setup();
    render(<TemplatesSettingsClient templates={[own, shared]} canShare={true} />);
    await user.type(screen.getByLabelText("Search templates"), "min");
    expect(screen.getByText("Mine")).toBeInTheDocument();
    expect(screen.queryByText("Theirs")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Search templates"));
    await user.type(screen.getByLabelText("Search templates"), "zzz");
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
  });

  it("T1: insert-field menu inserts a {{token}} at the cursor", async () => {
    const user = userEvent.setup();
    render(<TemplatesSettingsClient templates={[]} canShare={true} />);
    await user.click(screen.getByRole("button", { name: "New template" }));
    await user.click(screen.getByRole("button", { name: "Insert field" }));
    await user.click(screen.getByRole("menuitem", { name: "First name" }));
    await waitFor(() =>
      expect(screen.getByTestId("inserted")).toHaveTextContent("{{person.first_name}}"),
    );
  });

  it("T4b: bulk-select + delete calls the action with selected ids", async () => {
    const user = userEvent.setup();
    render(<TemplatesSettingsClient templates={[own, shared]} canShare={true} />);
    await user.click(screen.getByRole("checkbox", { name: /select Mine/i }));
    await user.click(screen.getByRole("button", { name: "Delete selected" }));
    await waitFor(() =>
      expect(deleteTemplatesAction).toHaveBeenCalledWith("csrf", { ids: [own.id] }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("T4b: a failed bulk delete surfaces the error id", async () => {
    deleteTemplatesAction.mockResolvedValueOnce({
      ok: false,
      error: { id: "E_GMAIL_010" },
    } as never);
    const user = userEvent.setup();
    render(<TemplatesSettingsClient templates={[own]} canShare={true} />);
    await user.click(screen.getByRole("checkbox", { name: /select Mine/i }));
    await user.click(screen.getByRole("button", { name: "Delete selected" }));
    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_GMAIL_010"));
  });

  it("surfaces the error id when create fails", async () => {
    createTemplateAction.mockResolvedValueOnce({
      ok: false,
      error: { id: "E_GMAIL_010" },
    } as never);
    const user = userEvent.setup();
    render(<TemplatesSettingsClient templates={[]} canShare={true} />);
    await user.click(screen.getByRole("button", { name: "New template" }));
    await user.type(screen.getByLabelText("Name"), "New one");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_GMAIL_010"));
  });

  it("surfaces the error id when a single delete fails", async () => {
    deleteTemplateAction.mockResolvedValueOnce({
      ok: false,
      error: { id: "E_PERM_001" },
    } as never);
    const user = userEvent.setup();
    render(<TemplatesSettingsClient templates={[own]} canShare={true} />);
    await user.click(screen.getByRole("button", { name: /delete Mine/i }));
    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
  });

  it("hides the share toggle when canShare is false", async () => {
    const user = userEvent.setup();
    render(<TemplatesSettingsClient templates={[]} canShare={false} />);
    await user.click(screen.getByRole("button", { name: "New template" }));
    expect(screen.queryByLabelText(/share with team/i)).not.toBeInTheDocument();
  });
});
