// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("opens the definitional answer and collapses the rest without dropping their text", () => {
    render(<FaqSection />);
    const [first, ...rest] = LANDING_STRINGS.faq.items;
    if (first === undefined) expect.unreachable("no faq items");
    expect(screen.getByRole("button", { name: first.q })).toHaveAttribute("aria-expanded", "true");
    for (const item of rest) {
      expect(screen.getByRole("button", { name: item.q })).toHaveAttribute("aria-expanded", "false");
      expect(screen.getByText(item.a)).toBeInTheDocument();
    }
  });

  it("expands a collapsed answer on click", async () => {
    const user = userEvent.setup();
    render(<FaqSection />);
    const second = LANDING_STRINGS.faq.items[1];
    if (second === undefined) expect.unreachable("need two faq items");
    const trigger = screen.getByRole("button", { name: second.q });
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(second.a)).toBeVisible();
  });

  it("anchors the section at #faq for deep links", () => {
    const { container } = render(<FaqSection />);
    expect(container.querySelector("#faq")).not.toBeNull();
  });
});
