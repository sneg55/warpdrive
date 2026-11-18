// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ImportHistory } from "./ImportHistory";

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ import: { listBatches: { invalidate: vi.fn() } } }),
    import: { listBatches: { useQuery: () => ({ data: [] }) } },
  },
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

afterEach(cleanup);

it("renders no page-level (h1) heading; the page owns the title", () => {
  render(<ImportHistory />);
  expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
});
