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

  it("links Docs at the documentation site", () => {
    stubFetch(500, {});
    render(<LandingNav />);
    const link = screen.getByRole("link", { name: LANDING_STRINGS.nav.docs });
    expect(link).toHaveAttribute("href", LANDING_STRINGS.nav.docsHref);
  });

  it("keeps the Docs link visible on mobile", () => {
    // The sibling nav items are in-page anchors and carry `hidden sm:inline`, which
    // costs a phone visitor nothing because they can still scroll. Docs is an
    // external destination and LandingFooter has no link columns, so the nav is the
    // only route to it. Hiding it below `sm` would strand mobile visitors entirely.
    stubFetch(500, {});
    render(<LandingNav />);
    const link = screen.getByRole("link", { name: LANDING_STRINGS.nav.docs });
    expect(link.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  it("points the section links at the home page so they work from any page", () => {
    stubFetch(500, {});
    render(<LandingNav />);
    for (const name of [LANDING_STRINGS.nav.features, LANDING_STRINGS.nav.tour]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute(
        "href",
        expect.stringMatching(/^\/#/),
      );
    }
  });

  it("uses the build-time star count without asking GitHub from the browser", () => {
    const spy = stubFetch(200, { stargazers_count: 9999 });
    render(<LandingNav initialStars={74} />);
    expect(screen.getByRole("link", { name: /^GitHub/ })).toHaveTextContent("74");
    expect(spy).not.toHaveBeenCalled();
  });

  it("shows no star badge when the star fetch fails", async () => {
    const spy = stubFetch(404, {});
    render(<LandingNav />);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const link = screen.getByRole("link", { name: /^GitHub/ });
    expect(link).not.toHaveTextContent(/\d/);
  });
});
