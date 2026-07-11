// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STRINGS } from "@/constants/strings";
import type { CustomFieldOption } from "@/types/customFields";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const report = vi.hoisted(() => vi.fn());
vi.mock("@/components/shell/ActionErrorProvider", () => ({ useActionError: () => report }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

const actions = vi.hoisted(() => ({
  addOptionAction: vi.fn<() => Promise<MockVoidActionResult>>(() => Promise.resolve({ ok: true })),
  archiveOptionAction: vi.fn<() => Promise<MockVoidActionResult>>(() =>
    Promise.resolve({ ok: true }),
  ),
  renameOptionAction: vi.fn<() => Promise<MockVoidActionResult>>(() =>
    Promise.resolve({ ok: true }),
  ),
}));
vi.mock("@/features/custom-fields/actions", () => actions);

import type { MockVoidActionResult } from "@/test/actionResult";
import { OptionEditor } from "./OptionEditor";

const S = STRINGS.settings;
const OPTIONS: CustomFieldOption[] = [{ id: "o1", label: "Red", archived: false }];

describe("OptionEditor surfaces failed mutations", () => {
  it("reports the error id when adding an option is denied", async () => {
    actions.addOptionAction.mockResolvedValueOnce({ ok: false, error: { id: "E_PERM_001" } });
    render(<OptionEditor defId="d1" options={OPTIONS} />);
    fireEvent.change(screen.getByLabelText(S.newOption), { target: { value: "Blue" } });
    fireEvent.click(screen.getByRole("button", { name: S.addOption }));
    await waitFor(() => expect(report).toHaveBeenCalledWith("E_PERM_001"));
  });

  it("reports the error id when removing an option is denied", async () => {
    actions.archiveOptionAction.mockResolvedValueOnce({ ok: false, error: { id: "E_PERM_001" } });
    render(<OptionEditor defId="d1" options={OPTIONS} />);
    fireEvent.click(screen.getByRole("button", { name: S.removeOption }));
    await waitFor(() => expect(report).toHaveBeenCalledWith("E_PERM_001"));
  });

  it("reports the error id when renaming an option is denied", async () => {
    actions.renameOptionAction.mockResolvedValueOnce({ ok: false, error: { id: "E_PERM_001" } });
    render(<OptionEditor defId="d1" options={OPTIONS} />);
    fireEvent.blur(screen.getByLabelText(`${S.optionLabel}: Red`), {
      target: { value: "Crimson" },
    });
    await waitFor(() => expect(report).toHaveBeenCalledWith("E_PERM_001"));
  });
});
