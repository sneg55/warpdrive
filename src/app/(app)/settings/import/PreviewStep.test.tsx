// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

afterEach(cleanup);

const useQuery = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: { import: { listRows: { useQuery: (...a: unknown[]) => useQuery(...a) } } },
}));

import { PreviewStep } from "./PreviewStep";

it("shows the valid/invalid summary and lists row errors", () => {
  useQuery.mockReturnValue({
    data: [
      { id: "r1", rowNumber: 1, status: "valid", errors: [] },
      {
        id: "r2",
        rowNumber: 2,
        status: "invalid",
        errors: [{ field: "name", message: "Required" }],
      },
    ],
  });
  render(
    <PreviewStep
      batchId="b1"
      validation={{ valid: 1, invalid: 1 }}
      busy={false}
      onCommit={vi.fn()}
    />,
  );
  expect(screen.getByText("1 valid")).toBeInTheDocument();
  expect(screen.getByText("1 with errors")).toBeInTheDocument();
  expect(screen.getByText(/Required/)).toBeInTheDocument();
});

it("commits the valid rows when clicked and disables when nothing is valid", () => {
  useQuery.mockReturnValue({ data: [] });
  const onCommit = vi.fn();
  const { rerender } = render(
    <PreviewStep
      batchId="b1"
      validation={{ valid: 2, invalid: 0 }}
      busy={false}
      onCommit={onCommit}
    />,
  );
  const btn = screen.getByRole("button", { name: "Import 2 valid rows" });
  fireEvent.click(btn);
  expect(onCommit).toHaveBeenCalledOnce();
  rerender(
    <PreviewStep
      batchId="b1"
      validation={{ valid: 0, invalid: 3 }}
      busy={false}
      onCommit={onCommit}
    />,
  );
  expect(screen.getByRole("button", { name: "Import 0 valid rows" })).toBeDisabled();
});
