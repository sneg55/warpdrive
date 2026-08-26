// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock, useQueryMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  useQueryMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: { search: { query: { useQuery: useQueryMock } } },
}));

import { CommandPalette } from "./CommandPalette";
import { OPEN_SEARCH_EVENT } from "./events";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  pushMock.mockClear();
  useQueryMock.mockReset();
});

const ACME = {
  deals: [],
  people: [],
  organizations: [{ id: "org-1", primary: "Acme Inc", secondary: null }],
  leads: [],
};

function open(): HTMLElement {
  render(<CommandPalette />);
  fireEvent(window, new Event(OPEN_SEARCH_EVENT));
  return screen.getByRole("searchbox", { name: "Search" });
}

function type(input: HTMLElement, text: string, settleDebounce: boolean): void {
  fireEvent.change(input, { target: { value: text } });
  if (settleDebounce) {
    act(() => {
      vi.advanceTimersByTime(200);
    });
  }
}

// Enter used to act on whatever the last resolved query returned. Once the results for a stale
// query are hidden behind the skeleton, acting on them navigates somewhere the user cannot see.
describe("CommandPalette stale selection", () => {
  it("does not navigate to a result that is hidden behind the searching skeleton", () => {
    vi.useFakeTimers();
    useQueryMock.mockReturnValue({ data: ACME, error: null });
    const input = open();
    type(input, "Acme", true);
    // The result is on screen and selectable at this point.
    expect(screen.getByText("Acme Inc")).toBeInTheDocument();

    // Refine the query. The debounce has not fired, so "Acme Inc" is now behind a skeleton.
    type(input, "Acme W", false);
    expect(screen.queryByText("Acme Inc")).toBeNull();

    fireEvent.keyDown(input, { key: "Enter" });

    expect(pushMock).not.toHaveBeenCalled();
  });

  it("does not navigate when the search failed", () => {
    vi.useFakeTimers();
    useQueryMock.mockReturnValue({ data: ACME, error: { message: "boom" } });
    const input = open();
    type(input, "Acme", true);

    fireEvent.keyDown(input, { key: "Enter" });

    expect(pushMock).not.toHaveBeenCalled();
  });

  it("still navigates once the results on screen are the current ones", () => {
    vi.useFakeTimers();
    useQueryMock.mockReturnValue({ data: ACME, error: null });
    const input = open();
    type(input, "Acme", true);

    fireEvent.keyDown(input, { key: "Enter" });

    expect(pushMock).toHaveBeenCalledWith("/contacts/orgs/org-1");
  });
});
