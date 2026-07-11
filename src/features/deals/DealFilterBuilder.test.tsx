// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc-client", () => ({
  trpc: { identity: { assignableUsers: { useQuery: () => ({ data: [] }) } } },
}));

import { DealFilterBuilder } from "./DealFilterBuilder";

afterEach(cleanup);

const STAGES = [{ id: "s1", name: "Qualified" }];

describe("DealFilterBuilder", () => {
  it("applies a typed condition as a deal filter definition", () => {
    const onApply = vi.fn();
    render(<DealFilterBuilder stages={STAGES} activeCount={0} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.click(screen.getByRole("button", { name: /add condition/i }));
    fireEvent.change(screen.getByLabelText("Condition 1 value"), { target: { value: "acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    // Default first field is Title (op "eq" per the schema TEXT_OPS order).
    expect(onApply).toHaveBeenCalledWith({
      conditions: [{ field: "title", op: "eq", value: "acme" }],
    });
  });

  it("clears the applied definition", () => {
    const onApply = vi.fn();
    render(<DealFilterBuilder stages={STAGES} activeCount={1} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onApply).toHaveBeenCalledWith(null);
  });
});
