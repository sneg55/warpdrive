// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const report = vi.hoisted(() => vi.fn());
vi.mock("@/components/shell/ActionErrorProvider", () => ({ useActionError: () => report }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/features/email/composer/RichTextBody", () => ({
  RichTextBody: ({ html }: { html: string }) => <div data-testid="rte">{html}</div>,
}));

const actions = vi.hoisted(() => ({
  createSignatureAction: vi.fn<() => Promise<MockActionResult<{ id: string }>>>(() =>
    Promise.resolve({ ok: true, value: { id: "s9" } }),
  ),
  updateSignatureAction: vi.fn<() => Promise<MockActionResult>>(() =>
    Promise.resolve({ ok: true, value: undefined }),
  ),
  deleteSignatureAction: vi.fn<() => Promise<MockActionResult>>(() =>
    Promise.resolve({ ok: true, value: undefined }),
  ),
  setDefaultSignatureAction: vi.fn<() => Promise<MockActionResult>>(() =>
    Promise.resolve({ ok: true, value: undefined }),
  ),
}));
vi.mock("@/features/email/authoringActions", () => actions);

import type { MockActionResult } from "@/test/actionResult";
import { SignaturesSettingsClient } from "./SignaturesSettingsClient";

const SIGS = [{ id: "s1", name: "Work", isDefault: true, bodyHtml: "<p>w</p>" }];

describe("SignaturesSettingsClient surfaces failed mutations", () => {
  it("reports the error id when delete is denied", async () => {
    actions.deleteSignatureAction.mockResolvedValueOnce({
      ok: false,
      error: { id: "E_PERM_001" },
    });
    render(<SignaturesSettingsClient signatures={SIGS} />);
    fireEvent.click(screen.getByRole("button", { name: /delete.*Work/i }));
    await waitFor(() => expect(report).toHaveBeenCalledWith("E_PERM_001"));
  });

  it("reports the error id when set-default is denied", async () => {
    actions.setDefaultSignatureAction.mockResolvedValueOnce({
      ok: false,
      error: { id: "E_PERM_001" },
    });
    render(
      <SignaturesSettingsClient
        signatures={[{ id: "s2", name: "Personal", isDefault: false, bodyHtml: "<p>p</p>" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /set as default.*Personal/i }));
    await waitFor(() => expect(report).toHaveBeenCalledWith("E_PERM_001"));
  });

  it("reports the error id when saving a new signature is denied", async () => {
    actions.createSignatureAction.mockResolvedValueOnce({
      ok: false,
      error: { id: "E_PERM_001" },
    });
    render(<SignaturesSettingsClient signatures={SIGS} />);
    fireEvent.click(screen.getByRole("button", { name: /new signature/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Draft" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(report).toHaveBeenCalledWith("E_PERM_001"));
  });
});
