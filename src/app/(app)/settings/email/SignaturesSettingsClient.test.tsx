// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("@/components/shell/ActionErrorProvider", () => ({ useActionError: () => vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/features/email/composer/RichTextBody", () => ({
  RichTextBody: ({ html }: { html: string }) => <div data-testid="rte">{html}</div>,
}));
vi.mock("@/features/email/authoringActions", () => ({
  createSignatureAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "s9" } })),
  updateSignatureAction: vi.fn(() => Promise.resolve({ ok: true, value: undefined })),
  deleteSignatureAction: vi.fn(() => Promise.resolve({ ok: true, value: undefined })),
  setDefaultSignatureAction: vi.fn(() => Promise.resolve({ ok: true, value: undefined })),
}));

import { SignaturesSettingsClient } from "./SignaturesSettingsClient";

describe("SignaturesSettingsClient", () => {
  it("marks the default and offers set-default on non-default rows", () => {
    render(
      <SignaturesSettingsClient
        signatures={[
          { id: "s1", name: "Work", isDefault: true, bodyHtml: "<p>w</p>" },
          { id: "s2", name: "Personal", isDefault: false, bodyHtml: "<p>p</p>" },
        ]}
      />,
    );
    // "Default" (exact) matches only the badge, not the "Set as default" button text.
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /set as default.*Personal/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /set as default.*Work/i })).not.toBeInTheDocument();
  });

  it("caps the signature name at 40 characters and shows the hint", () => {
    render(<SignaturesSettingsClient signatures={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /new signature/i }));
    expect(screen.getByLabelText(/name/i)).toHaveAttribute("maxLength", "40");
    expect(screen.getByText("Max 40 characters")).toBeInTheDocument();
  });
});
