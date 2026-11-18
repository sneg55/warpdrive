// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const { refresh, reportError, archiveDealAction, invalidateQueries } = vi.hoisted(() => ({
  refresh: vi.fn(),
  reportError: vi.fn(),
  archiveDealAction: vi.fn(),
  invalidateQueries: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/components/shell/ActionErrorProvider", () => ({ useActionError: () => reportError }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("./archiveActions", () => ({ archiveDealAction, archiveDealsAction: vi.fn() }));
vi.mock("./bulkStageAction", () => ({ bulkStageAction: vi.fn() }));

import { ERROR_IDS } from "@/constants/errorIds";
import { DEAL_LIST_QUERY_ROOT } from "./dealListQueryKey";
import { useDealListActions } from "./useDealListActions";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("unarchive invalidates the deal-list read so the row leaves the archived table", async () => {
  archiveDealAction.mockResolvedValue({ ok: true });
  const { result } = renderHook(() => useDealListActions());

  const applied = await result.current.unarchive("d1");

  expect(archiveDealAction).toHaveBeenCalledWith({ dealId: "d1", archived: false }, "csrf");
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [DEAL_LIST_QUERY_ROOT] });
  expect(applied).toBe(true);
});

it("a failed unarchive reports the error and leaves the cached rows alone", async () => {
  archiveDealAction.mockResolvedValue({ ok: false, error: { id: "E_PERM_001" } });
  const { result } = renderHook(() => useDealListActions());

  const applied = await result.current.unarchive("d1");

  expect(reportError).toHaveBeenCalledWith("E_PERM_001");
  expect(invalidateQueries).not.toHaveBeenCalled();
  expect(applied).toBe(false);
});

it("an unarchive that rejects reports an unconfirmed action instead of throwing", async () => {
  archiveDealAction.mockRejectedValue(new Error("connection dropped"));
  const { result } = renderHook(() => useDealListActions());

  const applied = await result.current.unarchive("d1");

  expect(reportError).toHaveBeenCalledWith(ERROR_IDS.UI_ACTION_UNCONFIRMED);
  expect(applied).toBe(false);
});
