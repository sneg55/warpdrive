// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AttributionLine } from "./AttributionLine";
import { CreatedCard } from "./CreatedCard";

afterEach(cleanup);

const AT = new Date("2026-07-02T15:37:00Z");

describe("AttributionLine", () => {
  it("renders a <time> with the actor and (Web App) source", () => {
    render(<AttributionLine at={AT} actorName="Nick Sawinyh" />);
    const time = screen.getByText(/2026|Jul/i, { selector: "time" });
    expect(time).toHaveAttribute("dateTime", AT.toISOString());
    expect(screen.getByText(/Nick Sawinyh \(Web App\)/)).toBeInTheDocument();
  });

  it("humanizes an email-shaped actor name instead of leaking the email", () => {
    render(<AttributionLine at={AT} actorName="demo1@example.com" />);
    expect(screen.queryByText(/demo1@example\.com/)).not.toBeInTheDocument();
    expect(screen.getByText(/Demo1 \(Web App\)/)).toBeInTheDocument();
  });

  it("shows a neutral fallback (not an email or 'null') when the actor is null", () => {
    render(<AttributionLine at={AT} actorName={null} />);
    expect(screen.queryByText(/Web App/)).not.toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
    expect(screen.getByText(/Someone/)).toBeInTheDocument();
    expect(document.querySelector("time")).toHaveAttribute("dateTime", AT.toISOString());
  });
});

describe("CreatedCard", () => {
  it("renders the 'Deal created' title with a timestamped attribution", () => {
    render(<CreatedCard at={AT} actorName="Nick" />);
    expect(screen.getByText("Deal created")).toBeInTheDocument();
    expect(screen.getByText(/Nick \(Web App\)/)).toBeInTheDocument();
    expect(document.querySelector("time")).toHaveAttribute("dateTime", AT.toISOString());
  });
});
