// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PageHeading } from "./PageHeading";

afterEach(cleanup);

describe("PageHeading", () => {
  it("renders the title as an h1 at the display size and 450 weight", () => {
    render(<PageHeading title="People" />);
    const h1 = screen.getByRole("heading", { level: 1, name: "People" });
    expect(h1.className).toContain("text-display");
    expect(h1.className).toContain("font-[450]");
    expect(h1.className).not.toContain("font-semibold");
  });

  it("renders a description below the title", () => {
    render(<PageHeading description="Manage every contact record." title="People" />);
    const description = screen.getByText("Manage every contact record.");
    expect(description.tagName).toBe("P");
    expect(description.className).toContain("text-muted-foreground");
  });

  it("renders crumbs as links, with the current page as plain non-link text", () => {
    render(
      <PageHeading
        crumbs={[{ label: "Contacts", href: "/contacts/people" }, { label: "People" }]}
        title="People"
      />,
    );
    expect(screen.getByRole("link", { name: "Contacts" }).getAttribute("href")).toBe(
      "/contacts/people",
    );
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    const current = nav.querySelector('[aria-current="page"]');
    expect(current?.textContent).toBe("People");
    expect(screen.queryByRole("link", { name: "People" })).toBeNull();
  });

  it("omits the breadcrumb nav when no crumbs are given", () => {
    render(<PageHeading title="Solo" />);
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
  });
});
