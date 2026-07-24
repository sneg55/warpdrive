// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STRINGS } from "@/constants/strings";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const report = vi.hoisted(() => vi.fn());
vi.mock("@/components/shell/ActionErrorProvider", () => ({ useActionError: () => report }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

type Result = { ok: true } | { ok: false; error: { id: string } };
const { setUiFlagAction, setOpenDetailsAfterCreateAction, setScheduleFollowUpAfterWonAction } =
  vi.hoisted(() => ({
    setUiFlagAction: vi.fn((): Promise<Result> => Promise.resolve({ ok: true })),
    setOpenDetailsAfterCreateAction: vi.fn((): Promise<Result> => Promise.resolve({ ok: true })),
    setScheduleFollowUpAfterWonAction: vi.fn((): Promise<Result> => Promise.resolve({ ok: true })),
  }));
vi.mock("@/features/identity/preferencesActions", () => ({
  setUiFlagAction,
  setOpenDetailsAfterCreateAction,
  setScheduleFollowUpAfterWonAction,
}));

import type { InterfacePrefs } from "@/features/identity/InterfacePrefsProvider";
import { INTERFACE_PREFS_DEFAULT } from "@/features/identity/InterfacePrefsProvider";
import { InterfacePreferences } from "./InterfacePreferences";

const t = STRINGS.settings.interface;

function renderInterface(prefs: InterfacePrefs = INTERFACE_PREFS_DEFAULT, followUp = false): void {
  render(<InterfacePreferences prefs={prefs} scheduleFollowUpAfterWon={followUp} />);
}

describe("InterfacePreferences", () => {
  it("optimistically persists a boolean flag toggle", () => {
    renderInterface();
    const toggle = screen.getByRole("switch", { name: t.usPhoneFormat });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(setUiFlagAction).toHaveBeenCalledWith({ key: "usPhoneFormat", value: true }, "csrf");
  });

  it("reverts and reports when a flag save fails", async () => {
    setUiFlagAction.mockResolvedValueOnce({ ok: false, error: { id: "E_X" } });
    renderInterface();
    const toggle = screen.getByRole("switch", { name: t.winSound });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
    expect(report).toHaveBeenCalledWith("E_X");
  });

  it("persists the moved schedule-follow-up toggle via its dedicated action", () => {
    renderInterface(INTERFACE_PREFS_DEFAULT, false);
    fireEvent.click(
      screen.getByRole("switch", { name: STRINGS.settings.scheduleFollowUpAfterWon }),
    );
    expect(setScheduleFollowUpAfterWonAction).toHaveBeenCalledWith({ enabled: true }, "csrf");
  });

  it("toggling the parent open-details switch sets all three entities", async () => {
    renderInterface();
    const parent = screen.getByRole("switch", { name: t.openDetailsAfterCreate });
    fireEvent.click(parent);
    await waitFor(() =>
      expect(setOpenDetailsAfterCreateAction).toHaveBeenCalledWith(
        { leadDeal: true, person: true, org: true },
        "csrf",
      ),
    );
  });

  it("parent switch is on only when all three children are on", () => {
    renderInterface({
      ...INTERFACE_PREFS_DEFAULT,
      openDetailsAfterCreate: { leadDeal: true, person: true, org: true },
    });
    expect(screen.getByRole("switch", { name: t.openDetailsAfterCreate })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("toggling one child persists the whole object", async () => {
    renderInterface();
    fireEvent.click(screen.getByRole("switch", { name: t.openDetailsPerson }));
    await waitFor(() =>
      expect(setOpenDetailsAfterCreateAction).toHaveBeenCalledWith(
        { leadDeal: false, person: true, org: false },
        "csrf",
      ),
    );
  });

  it("preserves every open-details change when children are toggled in one render", async () => {
    renderInterface();
    const leadDeal = screen.getByRole("switch", { name: t.openDetailsLeadDeal });
    const person = screen.getByRole("switch", { name: t.openDetailsPerson });
    const org = screen.getByRole("switch", { name: t.openDetailsOrg });

    act(() => {
      leadDeal.click();
      person.click();
      org.click();
    });

    await waitFor(() => expect(setOpenDetailsAfterCreateAction).toHaveBeenCalledTimes(3));
    expect(setOpenDetailsAfterCreateAction).toHaveBeenNthCalledWith(
      1,
      { leadDeal: true, person: false, org: false },
      "csrf",
    );
    expect(setOpenDetailsAfterCreateAction).toHaveBeenNthCalledWith(
      2,
      { leadDeal: true, person: true, org: false },
      "csrf",
    );
    expect(setOpenDetailsAfterCreateAction).toHaveBeenNthCalledWith(
      3,
      { leadDeal: true, person: true, org: true },
      "csrf",
    );
    expect(screen.getByRole("switch", { name: t.openDetailsAfterCreate })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
