// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const reportError = vi.fn();
vi.mock("@/components/shell/ActionErrorProvider", () => ({
  useActionError: () => reportError,
}));

afterEach(() => {
  cleanup();
  reportError.mockClear();
});

const deleteMock = vi.fn(() => Promise.resolve({ ok: true, value: { id: "d1" } }));
vi.mock("./folderActions", () => ({
  deleteDraftAction: (...a: unknown[]) => deleteMock(...(a as [])),
}));
const invalidate = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    email: {
      drafts: {
        list: {
          useQuery: () => ({
            data: [
              {
                id: "d1",
                subject: "Hello",
                bodyHtml: "<p>x</p>",
                toEmails: ["a@y.com"],
                ccEmails: [],
                threadId: null,
                accountId: "acc",
                updatedAt: "2026-07-03T00:00:00Z",
              },
            ],
          }),
        },
      },
    },
    useUtils: () => ({ email: { drafts: { list: { invalidate } } } }),
  },
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { DraftsList } from "./DraftsList";

it("renders a draft row and resumes it on click", () => {
  const onResume = vi.fn();
  render(<DraftsList onResume={onResume} />);
  expect(screen.getByText("Hello")).toBeInTheDocument();
  screen.getByRole("button", { name: /Hello/ }).click();
  expect(onResume).toHaveBeenCalledWith(expect.objectContaining({ id: "d1", subject: "Hello" }));
});

it("reports the error id when deleting a draft is denied (no silent no-op)", async () => {
  deleteMock.mockResolvedValueOnce({ ok: false, error: { id: "E_PERM_001" } } as never);
  render(<DraftsList onResume={vi.fn()} />);
  screen.getByRole("button", { name: "Delete" }).click();
  await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
});
