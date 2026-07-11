// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TITLE_MAX_LEN } from "@/constants/fieldLimits";

// LabelField (in the modal) queries the label catalog via tRPC.
vi.mock("@/lib/trpc-client", () => ({
  trpc: { labels: { listByTarget: { useQuery: () => ({ data: [] }) } } },
}));

import { AddLeadLeftColumn } from "./AddLeadLeftColumn";
import { initialAddLeadState } from "./addLeadState";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  // cmdk (Combobox) observes its list's size to manage height; jsdom has no ResizeObserver.
  global.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
});

afterEach(cleanup);

function baseProps(set = vi.fn()) {
  return {
    state: initialAddLeadState(),
    set,
    people: [],
    orgs: [],
    owners: [{ id: "u1", name: "Alice" }],
    groups: null,
    baseCurrency: "USD",
  };
}

describe("AddLeadLeftColumn owner picker", () => {
  it("renders the owner picker as a searchable avatar Combobox and flows a selection into state", () => {
    const set = vi.fn();
    render(<AddLeadLeftColumn {...baseProps(set)} />);
    fireEvent.click(screen.getByLabelText("Owner"));
    fireEvent.click(screen.getByText("Alice"));
    expect(set).toHaveBeenCalledWith({ ownerId: "u1" });
  });
});

describe("AddLeadLeftColumn title counter", () => {
  it("shows a live title character counter that reflects the max length", () => {
    const props = baseProps();
    const { rerender } = render(<AddLeadLeftColumn {...props} />);
    expect(screen.getByText(`0/${TITLE_MAX_LEN}`)).toBeInTheDocument();

    rerender(<AddLeadLeftColumn {...props} state={{ ...props.state, title: "Acme" }} />);
    expect(screen.getByText(`4/${TITLE_MAX_LEN}`)).toBeInTheDocument();
  });
});
