// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LANDING_STRINGS } from "@/constants/landingStrings";
import { LandingNav } from "./LandingNav";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubFetch(status: number, body: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("LandingNav", () => {
  it("links the GitHub button at the repo in a new tab", () => {
    stubFetch(500, {});
    render(<LandingNav />);
    const link = screen.getByRole("link", { name: /^GitHub/ });
    expect(link).toHaveAttribute("href", LANDING_STRINGS.hero.ctaHref);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders a compact star count once the GitHub API responds", async () => {
    stubFetch(200, { stargazers_count: 1234 });
    render(<LandingNav />);
    const link = screen.getByRole("link", { name: /^GitHub/ });
    await waitFor(() => expect(link).toHaveTextContent("1.2K"));
  });

  it("shows no star badge when the star fetch fails", async () => {
    const spy = stubFetch(404, {});
    render(<LandingNav />);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const link = screen.getByRole("link", { name: /^GitHub/ });
    expect(link).not.toHaveTextContent(/\d/);
  });
});
