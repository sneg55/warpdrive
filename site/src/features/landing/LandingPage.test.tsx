// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LANDING_STRINGS } from "@/constants/landingStrings";
import type { RepoFacts } from "@/types/repoFacts";
import { LandingPage } from "./LandingPage";

const FACTS: RepoFacts = { stars: 74, release: { version: "1.4.0", releasedOn: "2026-10-30" } };
const NO_REPO_FACTS: RepoFacts = { stars: null, release: null };

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LandingPage", () => {
  it("leads the H1 with the category and keeps the brand line as a subhead", () => {
    render(<LandingPage facts={NO_REPO_FACTS} />);
    const heading = screen.getByRole("heading", { level: 1 });
    // The H1 must carry the primary category query, not only brand poetry.
    expect(heading).toHaveTextContent(LANDING_STRINGS.hero.title);
    expect(heading.textContent ?? "").toMatch(/Pipedrive alternative/i);
    // The poetic brand line survives as a distinct element, not lost.
    expect(screen.getByText(LANDING_STRINGS.hero.tagline)).toBeInTheDocument();
  });

  it("renders the hero pitch with a CTA pointing at the GitHub repo", () => {
    render(<LandingPage facts={NO_REPO_FACTS} />);
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
    const { container } = render(<LandingPage facts={NO_REPO_FACTS} />);
    expect(container.querySelector("#self-host")).not.toBeNull();
  });

  it("links the nav button at the GitHub repo", () => {
    render(<LandingPage facts={NO_REPO_FACTS} />);
    const link = screen.getByRole("link", { name: /^GitHub/ });
    expect(link).toHaveAttribute("href", LANDING_STRINGS.hero.ctaHref);
  });

  it("lists every feature from the copy constants", () => {
    const { container } = render(<LandingPage facts={NO_REPO_FACTS} />);
    // "Deal workspace" also headlines a tour row, so scope title lookups to the section.
    const section = container.querySelector<HTMLElement>("#features");
    if (section === null) expect.unreachable("features section not rendered");
    for (const item of LANDING_STRINGS.features.items) {
      expect(within(section).getByText(item.title)).toBeInTheDocument();
    }
  });

  it("renders the product tour with the README screenshots", () => {
    render(<LandingPage facts={NO_REPO_FACTS} />);
    expect(screen.getByAltText(LANDING_STRINGS.hero.shotAlt)).toBeInTheDocument();
    for (const item of LANDING_STRINGS.tour.items) {
      expect(screen.getByAltText(item.alt)).toBeInTheDocument();
      expect(screen.getByText(item.caption)).toBeInTheDocument();
    }
  });

  it("zooms a screenshot into a lightbox on click", async () => {
    const user = userEvent.setup();
    render(<LandingPage facts={NO_REPO_FACTS} />);
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
    render(<LandingPage facts={NO_REPO_FACTS} />);
    for (const line of LANDING_STRINGS.selfHost.code) {
      expect(screen.getByText(line.text)).toBeInTheDocument();
    }
  });

  it("renders the Pipedrive comparison with the no-affiliation disclaimer", () => {
    render(<LandingPage facts={NO_REPO_FACTS} />);
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
    const { container } = render(<LandingPage facts={NO_REPO_FACTS} />);
    expect(container.querySelector("#faq")).not.toBeNull();
    const [first] = LANDING_STRINGS.faq.items;
    if (first === undefined) expect.unreachable("no faq items in copy constants");
    expect(screen.getByRole("heading", { name: first.q })).toBeInTheDocument();
  });

  it("shows the latest release version and date when the build knew them", () => {
    render(<LandingPage facts={FACTS} />);
    const line = screen.getByText(/Latest release/);
    expect(line).toHaveTextContent("v1.4.0");
    expect(line).toHaveTextContent("October 30, 2026");
  });

  it("leaves the release line out when the build could not reach GitHub", () => {
    render(<LandingPage facts={NO_REPO_FACTS} />);
    expect(screen.queryByText(/Latest release/)).not.toBeInTheDocument();
  });

  it("puts the build-time star count in the nav without waiting for the browser fetch", () => {
    render(<LandingPage facts={FACTS} />);
    expect(screen.getByRole("link", { name: /^GitHub/ })).toHaveTextContent("74");
  });

  it("features the MCP server and the Pipedrive import", () => {
    const { container } = render(<LandingPage facts={NO_REPO_FACTS} />);
    const section = container.querySelector<HTMLElement>("#features");
    expect(section?.textContent ?? "").toMatch(/MCP/);
    expect(section?.textContent ?? "").toMatch(/Pipedrive/);
  });

  it("links the comparison and migration pages from the footer", () => {
    render(<LandingPage facts={NO_REPO_FACTS} />);
    const footer = screen.getByRole("contentinfo");
    for (const href of ["/vs/twenty", "/vs/espocrm", "/migrate-from-pipedrive"]) {
      expect(within(footer).getAllByRole("link").map((a) => a.getAttribute("href"))).toContain(
        href,
      );
    }
  });

  it("embeds the release version in the JSON-LD", () => {
    const { container } = render(<LandingPage facts={FACTS} />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script?.textContent ?? "").toContain('"softwareVersion":"1.4.0"');
  });

  it("embeds JSON-LD structured data including a FAQPage", () => {
    const { container } = render(<LandingPage facts={NO_REPO_FACTS} />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const data = JSON.parse(script?.textContent ?? "{}") as {
      "@graph": Array<{ "@type": string }>;
    };
    expect(data["@graph"].some((node) => node["@type"] === "FAQPage")).toBe(true);
  });
});
