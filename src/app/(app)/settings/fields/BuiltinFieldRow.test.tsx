// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

type VoidResult = { ok: true } | { ok: false; error: { id: string } };
const { setBuiltinFieldHiddenAction } = vi.hoisted(() => ({
  setBuiltinFieldHiddenAction: vi.fn((): Promise<VoidResult> => Promise.resolve({ ok: true })),
}));
vi.mock("@/features/custom-fields/actions", () => ({ setBuiltinFieldHiddenAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

const reportError = vi.fn();
vi.mock("@/components/shell/ActionErrorProvider", () => ({
  useActionError: () => reportError,
}));

import { BuiltinFieldRow } from "./BuiltinFieldRow";

describe("BuiltinFieldRow", () => {
  it("shows the label and a Built-in badge", () => {
    render(
      <BuiltinFieldRow
        entity="organization"
        row={{ key: "industry", label: "Industry", locked: false, hidden: false }}
      />,
    );
    expect(screen.getByText("Industry")).toBeTruthy();
    expect(screen.getByText("Built-in")).toBeTruthy();
  });

  it("toggles hidden via the action for a non-locked field", async () => {
    render(
      <BuiltinFieldRow
        entity="organization"
        row={{ key: "industry", label: "Industry", locked: false, hidden: false }}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /hidden/i }));
    await waitFor(() =>
      expect(setBuiltinFieldHiddenAction).toHaveBeenCalledWith(
        { entity: "organization", key: "industry", hidden: true },
        "csrf",
      ),
    );
  });

  it("shows no toggle for a locked field", () => {
    render(
      <BuiltinFieldRow
        entity="organization"
        row={{ key: "name", label: "Name", locked: true, hidden: false }}
      />,
    );
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByText(/always shown/i)).toBeTruthy();
  });

  it("surfaces a failure via the error reporter", async () => {
    setBuiltinFieldHiddenAction.mockResolvedValueOnce({
      ok: false as const,
      error: { id: "E_CF_005" },
    });
    render(
      <BuiltinFieldRow
        entity="organization"
        row={{ key: "industry", label: "Industry", locked: false, hidden: false }}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /hidden/i }));
    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_CF_005"));
  });
});
