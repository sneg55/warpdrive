import { describe, expect, it, vi } from "vitest";

// The app entry should land on the pipeline board (Pipedrive's default screen),
// not the settings page.
const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));

describe("root page", () => {
  it("redirects to the pipeline board", async () => {
    const { default: Home } = await import("./page");
    try {
      Home();
    } catch {
      // redirect() throws in the real runtime; our mock does not, but guard anyway.
    }
    expect(redirect).toHaveBeenCalledWith("/pipeline");
  });
});
