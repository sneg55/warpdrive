// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LANDING_STRINGS } from "@/constants/landingStrings";
import { FaqSection } from "./FaqSection";

afterEach(cleanup);

describe("FaqSection", () => {
  it("renders every question as a heading with its answer", () => {
    render(<FaqSection />);
    for (const item of LANDING_STRINGS.faq.items) {
      expect(screen.getByRole("heading", { name: item.q })).toBeInTheDocument();
      expect(screen.getByText(item.a)).toBeInTheDocument();
    }
  });

  it("anchors the section at #faq for deep links", () => {
    const { container } = render(<FaqSection />);
    expect(container.querySelector("#faq")).not.toBeNull();
  });
});
