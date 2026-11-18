import { describe, expect, it, vi } from "vitest";

const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));

describe("root page", () => {
  it("redirects to the pipeline board", async () => {
    const { default: Home } = await import("./page");
    try {
      Home();
    } catch {}
    expect(redirect).toHaveBeenCalledWith("/pipeline");
  });
});
