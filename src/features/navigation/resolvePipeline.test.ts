// @vitest-environment node
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { resolveVisiblePipeline } from "./resolvePipeline";

const list = [{ id: "a" }, { id: "b" }, { id: "c" }];

it("returns the pipeline when the id is in the visible list", () => {
  expect(resolveVisiblePipeline(list, "b")).toBe(list[1]);
});

it("calls notFound (404s) when the id is not in the visible list", () => {
  expect(() => resolveVisiblePipeline(list, "missing")).toThrow("NEXT_NOT_FOUND");
});

it("404s on an empty visible list rather than returning undefined", () => {
  expect(() => resolveVisiblePipeline([], "a")).toThrow("NEXT_NOT_FOUND");
});
