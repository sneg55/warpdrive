// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LANDING_STRINGS } from "@/constants/landingStrings";
import { LandingPage } from "./LandingPage";

// The nav fetches the GitHub star count on mount. Stub it so these composed-page tests never hit the
// network; the badge itself is covered in LandingNav.test.tsx. A 500 keeps the badge off.
beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LandingPage", () => {
  it("leads the H1 with the category and keeps the brand line as a subhead", () => {
    render(<LandingPage />);
    const heading = screen.getByRole("heading", { level: 1 });
    // The H1 must carry the primary category query, not only brand poetry.
    expect(heading).toHaveTextContent(LANDING_STRINGS.hero.title);
    expect(heading.textContent ?? "").toMatch(/Pipedrive alternative/i);
    // The poetic brand line survives as a distinct element, not lost.
    expect(screen.getByText(LANDING_STRINGS.hero.tagline)).toBeInTheDocument();
  });

  it("renders the hero pitch with a CTA pointing at the GitHub repo", () => {
    render(<LandingPage />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(LANDING_STRINGS.hero.title);
    const ctas = screen.getAllByRole("link", { name: LANDING_STRINGS.hero.cta });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", LANDING_STRINGS.hero.ctaHref);
      expect(cta).toHaveAttribute("target", "_blank");
    }
  });

  it("anchors the self-host section for deep links", () => {
    const { container } = render(<LandingPage />);
    expect(container.querySelector("#self-host")).not.toBeNull();
  });

  it("links the nav button at the GitHub repo", () => {
    render(<LandingPage />);
    const link = screen.getByRole("link", { name: /^GitHub/ });
    expect(link).toHaveAttribute("href", LANDING_STRINGS.hero.ctaHref);
  });

  it("lists every feature from the copy constants", () => {
    const { container } = render(<LandingPage />);
    // "Deal workspace" also headlines a tour row, so scope title lookups to the section.
    const section = container.querySelector<HTMLElement>("#features");
    if (section === null) expect.unreachable("features section not rendered");
    for (const item of LANDING_STRINGS.features.items) {
      expect(within(section).getByText(item.title)).toBeInTheDocument();
    }
  });

  it("renders the product tour with the README screenshots", () => {
    render(<LandingPage />);
    expect(screen.getByAltText(LANDING_STRINGS.hero.shotAlt)).toBeInTheDocument();
    for (const item of LANDING_STRINGS.tour.items) {
      expect(screen.getByAltText(item.alt)).toBeInTheDocument();
      expect(screen.getByText(item.caption)).toBeInTheDocument();
    }
  });

  it("zooms a screenshot into a lightbox on click", async () => {
    const user = userEvent.setup();
    render(<LandingPage />);
    const triggers = screen.getAllByRole("button", {
      name: new RegExp(`^${LANDING_STRINGS.shot.enlargeLabel}`),
    });
    expect(triggers.length).toBeGreaterThan(1);
    const first = triggers[0];
    if (first === undefined) expect.unreachable("no screenshot triggers rendered");
    await user.click(first);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByAltText(LANDING_STRINGS.hero.shotAlt)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the self-host commands in full (typing replays only in the browser)", () => {
    render(<LandingPage />);
    for (const line of LANDING_STRINGS.selfHost.code) {
      expect(screen.getByText(line.text)).toBeInTheDocument();
    }
  });

  it("renders the Pipedrive comparison with the no-affiliation disclaimer", () => {
    render(<LandingPage />);
    expect(
      screen.getByRole("heading", { name: LANDING_STRINGS.comparison.heading }),
    ).toBeInTheDocument();
    for (const row of LANDING_STRINGS.comparison.rows) {
      expect(screen.getByText(row.label)).toBeInTheDocument();
      expect(screen.getByText(row.warpdrive)).toBeInTheDocument();
      expect(screen.getByText(row.pipedrive)).toBeInTheDocument();
    }
    expect(screen.getByText(LANDING_STRINGS.comparison.disclaimer)).toBeInTheDocument();
  });

  it("answers the priority questions in an anchored FAQ section", () => {
    const { container } = render(<LandingPage />);
    expect(container.querySelector("#faq")).not.toBeNull();
    const [first] = LANDING_STRINGS.faq.items;
    if (first === undefined) expect.unreachable("no faq items in copy constants");
    expect(screen.getByRole("heading", { name: first.q })).toBeInTheDocument();
  });

  it("embeds JSON-LD structured data including a FAQPage", () => {
    const { container } = render(<LandingPage />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const data = JSON.parse(script?.textContent ?? "{}") as {
      "@graph": Array<{ "@type": string }>;
    };
    expect(data["@graph"].some((node) => node["@type"] === "FAQPage")).toBe(true);
  });
});
