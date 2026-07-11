// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setColumnViewAction = vi.hoisted(() => vi.fn(() => Promise.resolve({ ok: true as const })));
vi.mock("@/features/identity/preferencesActions", () => ({ setColumnViewAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { usePersistColumns } from "./usePersistColumns";

function Harness({ order }: { order: string[] }) {
  usePersistColumns("dealsList", order);
  return null;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setColumnViewAction.mockClear();
});

describe("usePersistColumns", () => {
  it("does not persist on the initial mount", () => {
    render(<Harness order={["title", "org"]} />);
    vi.advanceTimersByTime(1000);
    expect(setColumnViewAction).not.toHaveBeenCalled();
  });

  it("debounces and persists the column order after a change", () => {
    const { rerender } = render(<Harness order={["title", "org"]} />);
    rerender(<Harness order={["title", "org", "value"]} />);
    // Not yet: still within the debounce window.
    expect(setColumnViewAction).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(setColumnViewAction).toHaveBeenCalledWith(
      { view: "dealsList", columns: ["title", "org", "value"] },
      "csrf",
    );
  });
});
