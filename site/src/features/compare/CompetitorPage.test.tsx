// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMPETITORS } from "@/constants/competitors";
import { CompetitorPage } from "./CompetitorPage";

function graphNode(container: HTMLElement, type: string): Record<string, unknown> {
  const script = container.querySelector('script[type="application/ld+json"]');
  const data = JSON.parse(script?.textContent ?? "{}") as { "@graph"?: Array<Record<string, unknown>> };
  const node = data["@graph"]?.find((entry) => entry["@type"] === type);
  if (node === undefined) expect.unreachable(`no ${type} node in the JSON-LD graph`);
  return node;
}

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each(Object.values(COMPETITORS))("CompetitorPage for $name", (competitor) => {
  it("leads with a comparison H1 and an answer-first summary", () => {
    render(<CompetitorPage competitor={competitor} initialStars={null} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(competitor.heading);
    expect(screen.getByText(competitor.summary)).toBeInTheDocument();
  });

  it("renders every comparison row in a table", () => {
    render(<CompetitorPage competitor={competitor} initialStars={null} />);
    const table = screen.getByRole("table");
    for (const row of competitor.rows) {
      const header = within(table).getByRole("rowheader", { name: row.label });
      const tr = header.closest("tr");
      if (tr === null) expect.unreachable("row header outside a row");
      expect(tr).toHaveTextContent(row.warpdrive);
      expect(tr).toHaveTextContent(row.competitor);
    }
  });

  it("links each cited source and states the non-affiliation", () => {
    render(<CompetitorPage competitor={competitor} initialStars={null} />);
    for (const source of competitor.sources) {
      expect(screen.getByRole("link", { name: source.label })).toHaveAttribute("href", source.href);
    }
    expect(screen.getByText(competitor.disclaimer)).toBeInTheDocument();
  });

  it("emits WebPage JSON-LD about the Warpdrive software", () => {
    const page = graphNode(render(<CompetitorPage competitor={competitor} initialStars={null} />).container, "WebPage");
    expect(page.url).toBe(`https://warpdrivecrm.com/vs/${competitor.slug}`);
    expect(page.about).toEqual({ "@id": "https://warpdrivecrm.com/#software" });
  });

  it("answers the comparison questions on the page", () => {
    render(<CompetitorPage competitor={competitor} initialStars={null} />);
    for (const item of competitor.faq) {
      expect(screen.getByRole("heading", { level: 3, name: item.q })).toBeInTheDocument();
      expect(screen.getByText(item.a)).toBeInTheDocument();
    }
  });

  it("mirrors the visible questions in FAQPage JSON-LD", () => {
    const faq = graphNode(render(<CompetitorPage competitor={competitor} initialStars={null} />).container, "FAQPage");
    expect(faq.mainEntity).toEqual(
      competitor.faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    );
  });
});
