// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

const convertToLeadAction = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ ok: true as const, lead: { id: "l1" } })),
);
vi.mock("@/features/deal-workspace/convertToLeadAction", () => ({ convertToLeadAction }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
const reportError = vi.fn();
vi.mock("@/features/deal-workspace/DealActionErrorProvider", () => ({
  useDealActionError: () => reportError,
}));

import { ConvertToLeadDialog } from "./ConvertToLeadDialog";

afterEach(() => {
  cleanup();
  convertToLeadAction.mockClear();
  push.mockClear();
  reportError.mockClear();
});

const props = {
  dealId: "d1",
  expectedUpdatedAt: "2026-07-02T00:00:00.000Z",
  open: true,
  onOpenChange: vi.fn(),
};

it("confirming converts the deal and navigates to the new lead", async () => {
  const user = userEvent.setup();
  render(<ConvertToLeadDialog {...props} />);
  await user.click(screen.getByRole("button", { name: "Convert" }));
  await waitFor(() =>
    expect(convertToLeadAction).toHaveBeenCalledWith(
      { dealId: "d1", expectedUpdatedAt: props.expectedUpdatedAt },
      "csrf",
    ),
  );
  await waitFor(() => expect(push).toHaveBeenCalledWith("/leads/l1"));
});

it("surfaces the error and does not navigate when the conversion is denied", async () => {
  convertToLeadAction.mockResolvedValueOnce({
    ok: false as const,
    error: { id: "E_PERM_001" },
  } as never);
  const user = userEvent.setup();
  render(<ConvertToLeadDialog {...props} />);
  await user.click(screen.getByRole("button", { name: "Convert" }));
  await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
  expect(push).not.toHaveBeenCalled();
});
