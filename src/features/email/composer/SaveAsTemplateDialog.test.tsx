// @vitest-environment jsdom
// SaveAsTemplateDialog.test.tsx: saving the current composer draft as a private template.
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Radix Dialog needs these jsdom polyfills to open under userEvent.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { createTemplateMock, reportErrorMock, invalidateMock } = vi.hoisted(() => ({
  createTemplateMock: vi.fn(),
  reportErrorMock: vi.fn(),
  invalidateMock: vi.fn(),
}));

vi.mock("@/features/email/authoringActions", () => ({
  createTemplateAction: (...a: unknown[]) => createTemplateMock(...a),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "tok" }));
vi.mock("@/components/shell/ActionErrorProvider", () => ({
  useActionError: () => reportErrorMock,
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ email: { templates: { list: { invalidate: invalidateMock } } } }),
  },
}));

import { SaveAsTemplateDialog } from "./SaveAsTemplateDialog";

async function openAndName(name: string): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  render(<SaveAsTemplateDialog subject="Hi there" bodyHtml="<p>Body</p>" />);
  await user.click(screen.getByRole("button", { name: /save as template/i }));
  await user.type(await screen.findByLabelText(/template name/i), name);
  return user;
}

describe("SaveAsTemplateDialog", () => {
  it("disables Save until a non-whitespace name is entered", async () => {
    const user = userEvent.setup();
    render(<SaveAsTemplateDialog subject="Hi" bodyHtml="<p>b</p>" />);
    await user.click(screen.getByRole("button", { name: /save as template/i }));
    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(saveButton).toBeDisabled();
    await user.type(await screen.findByLabelText(/template name/i), "   ");
    expect(saveButton).toBeDisabled();
  });

  it("creates a PRIVATE template and closes on success", async () => {
    createTemplateMock.mockResolvedValue({ ok: true, value: { id: "t1" } });
    const user = await openAndName("Kickoff");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(createTemplateMock).toHaveBeenCalledWith("tok", {
        name: "Kickoff",
        subject: "Hi there",
        bodyHtml: "<p>Body</p>",
        isShared: false,
      });
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(invalidateMock).toHaveBeenCalled();
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("reports the error id and keeps the dialog open on failure", async () => {
    createTemplateMock.mockResolvedValue({ ok: false, error: { id: "E_GMAIL_010" } });
    const user = await openAndName("Kickoff");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(reportErrorMock).toHaveBeenCalledWith("E_GMAIL_010"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
