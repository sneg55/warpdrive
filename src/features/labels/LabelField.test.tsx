// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

const catalog = [
  { id: "l1", target: "deal", name: "Hot", color: "red", order: 0 },
  { id: "l2", target: "deal", name: "Enterprise", color: "purple", order: 1 },
];
vi.mock("@/lib/trpc-client", () => ({
  trpc: { labels: { listByTarget: { useQuery: () => ({ data: catalog }) } } },
}));

import { LabelField } from "./LabelField";

describe("LabelField", () => {
  it("renders a chip per applied label plus the catalog dropdown trigger", () => {
    render(<LabelField target="deal" value={["Enterprise"]} onChange={() => {}} />);
    expect(screen.getByText("Enterprise")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add labels/i })).toBeInTheDocument();
    // An unselected catalog label is not shown as a chip (only in the dropdown once opened).
    expect(screen.queryByText("Hot")).not.toBeInTheDocument();
  });
});
