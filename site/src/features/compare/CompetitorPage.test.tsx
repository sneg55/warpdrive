// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMPETITORS } from "@/constants/competitors";
import { CompetitorPage } from "./CompetitorPage";

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
    const { container } = render(<CompetitorPage competitor={competitor} initialStars={null} />);
    const script = container.querySelector('script[type="application/ld+json"]');
    const data = JSON.parse(script?.textContent ?? "{}") as Record<string, unknown>;
    expect(data["@type"]).toBe("WebPage");
    expect(data.url).toBe(`https://warpdrivecrm.com/vs/${competitor.slug}`);
    expect(data.about).toEqual({ "@id": "https://warpdrivecrm.com/#software" });
  });
});
