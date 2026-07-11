// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { DealActionErrorProvider } from "../DealActionErrorProvider";

type ChangeStageResult =
  | { ok: true; deal: { id: string; updatedAt: string } }
  | { ok: false; error: { id: string } };
const changeStageAction = vi.hoisted(() =>
  vi.fn(
    (): Promise<ChangeStageResult> =>
      Promise.resolve({ ok: true, deal: { id: "d1", updatedAt: "x" } }),
  ),
);
vi.mock("@/features/deal-workspace/actions", () => ({ changeStageAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { accentForOrder, tint } from "@/features/deals/boardStageHeader";
import { StageSelector } from "./StageSelector";

function alphaOf(rgba: string): number {
  const m = /rgba\([^)]*,\s*([\d.]+)\)$/.exec(rgba);
  return m === null ? Number.NaN : Number.parseFloat(m[1] ?? "");
}
function rgbPrefix(rgba: string): string {
  const m = /^(rgba\(\d+, \d+, \d+),/.exec(rgba);
  return m?.[1] ?? "";
}

afterEach(() => {
  cleanup();
  changeStageAction.mockClear();
});

const chips = [
  { id: "s1", name: "Qualified", current: false, passed: true, days: 0 },
  { id: "s2", name: "Proposal", current: true, passed: false, days: 3 },
  { id: "s3", name: "Won", current: false, passed: false, days: 0 },
];
const props = { dealId: "d1", expectedUpdatedAt: "2026-07-02T00:00:00.000Z", chips };

it("moving to a non-current stage calls changeStageAction with that stage id + updatedAt", () => {
  render(<StageSelector {...props} />);
  fireEvent.click(screen.getByRole("option", { name: /Won/ }));
  expect(changeStageAction).toHaveBeenCalledWith(
    { dealId: "d1", toStageId: "s3", expectedUpdatedAt: props.expectedUpdatedAt },
    "csrf",
  );
});

it("clicking the current stage is a no-op", () => {
  render(<StageSelector {...props} />);
  fireEvent.click(screen.getByRole("option", { name: /Proposal/ }));
  expect(changeStageAction).not.toHaveBeenCalled();
});

it("shows a 12px day-count on each chevron segment (C3 PD parity) while keeping the stage name", () => {
  render(<StageSelector {...props} />);
  // PD shows day-counts at 12px (not WD's old 10px). The current stage has spent 3 days.
  const dayCount = screen.getByText(/^3\s+days$/);
  expect(dayCount.className).toContain("text-xs");
  expect(dayCount.className).not.toContain("text-[10px]");
  // The stage-name affordance stays available (warpdrive keeps names; PD drops them).
  expect(screen.getByText("Proposal")).toBeDefined();
});

it("applies the interlocking chevron clip-path shape to each segment (C3)", () => {
  render(<StageSelector {...props} />);
  for (const name of [/Qualified/, /Proposal/, /Won/]) {
    const seg = screen.getByRole("option", { name });
    expect(seg.style.clipPath).toContain("polygon");
  }
});

it("tints each segment in its stage's pipeline hue (inherited from the board), not green/gray", () => {
  render(<StageSelector {...props} />);
  const qualified = screen.getByRole("option", { name: /Qualified/ }); // order 0 -> slate
  const proposal = screen.getByRole("option", { name: /Proposal/ }); // order 1 -> blue
  const won = screen.getByRole("option", { name: /Won/ }); // order 2 -> indigo
  // Each segment reads in its own order-hue, matching the pipeline board columns.
  expect(rgbPrefix(qualified.style.backgroundColor)).toBe(rgbPrefix(tint(accentForOrder(0), 1)));
  expect(rgbPrefix(proposal.style.backgroundColor)).toBe(rgbPrefix(tint(accentForOrder(1), 1)));
  expect(rgbPrefix(won.style.backgroundColor)).toBe(rgbPrefix(tint(accentForOrder(2), 1)));
  // No leftover uniform success-green / muted-gray classes.
  for (const seg of [qualified, proposal, won]) {
    expect(seg.className).not.toContain("bg-success");
    expect(seg.className).not.toContain("bg-muted");
    expect(seg.className).not.toContain("bg-primary");
  }
});

it("surfaces the shared error dialog when the stage change is denied (no silent swallow)", async () => {
  changeStageAction.mockResolvedValueOnce({
    ok: false as const,
    error: { id: ERROR_IDS.PERM_DENIED },
  });
  render(
    <DealActionErrorProvider>
      <StageSelector {...props} />
    </DealActionErrorProvider>,
  );
  fireEvent.click(screen.getByRole("option", { name: /Won/ }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent(/permission/i);
});

it("makes the current stage pop out of the row: slightly larger and raised above neighbours", () => {
  render(<StageSelector {...props} />);
  const current = screen.getByRole("option", { name: /Proposal/ });
  const passed = screen.getByRole("option", { name: /Qualified/ });
  // The current chevron is scaled up and sits above its neighbours so it reads as popped out.
  expect(current.className).toMatch(/scale-\[1\./);
  expect(current.className).toMatch(/z-10/);
  // Neighbours are not raised or enlarged.
  expect(passed.className).not.toMatch(/scale-\[1\./);
  expect(passed.className).not.toMatch(/z-10/);
});

it("conveys progress by fill intensity and bolds the current stage", () => {
  render(<StageSelector {...props} />);
  const passed = alphaOf(screen.getByRole("option", { name: /Qualified/ }).style.backgroundColor);
  const current = alphaOf(screen.getByRole("option", { name: /Proposal/ }).style.backgroundColor);
  const future = alphaOf(screen.getByRole("option", { name: /Won/ }).style.backgroundColor);
  expect(passed).toBeGreaterThan(future);
  expect(current).toBeGreaterThanOrEqual(passed);
  expect(screen.getByRole("option", { name: /Proposal/ }).style.fontWeight).toBe("600");
});
