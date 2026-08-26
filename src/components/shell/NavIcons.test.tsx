// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { Filter } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import {
  ActivitiesIcon,
  ContactsIcon,
  DashboardIcon,
  DealsIcon,
  InboxIcon,
  LeadsIcon,
  PipelineIcon,
  SettingsIcon,
} from "./NavIcons";

afterEach(cleanup);

const ICONS = [
  ["PipelineIcon", PipelineIcon],
  ["DealsIcon", DealsIcon],
  ["LeadsIcon", LeadsIcon],
  ["ContactsIcon", ContactsIcon],
  ["ActivitiesIcon", ActivitiesIcon],
  ["InboxIcon", InboxIcon],
  ["DashboardIcon", DashboardIcon],
  ["SettingsIcon", SettingsIcon],
] as const;

describe("NavIcons", () => {
  it.each(ICONS)("%s is decorative (aria-hidden), so the link label names the link", (_n, Icon) => {
    const { container } = render(<Icon />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it.each(ICONS)("%s defaults to the 18px nav size", (_n, Icon) => {
    const { container } = render(<Icon />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toContain("h-[18px] w-[18px] shrink-0");
  });

  it.each(ICONS)("%s honours a className override", (_n, Icon) => {
    const { container } = render(<Icon className="h-5 w-5" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toContain("h-5 w-5");
    expect(svg?.getAttribute("class")).not.toContain("h-[18px]");
  });

  it("renders every nav glyph distinctly", () => {
    const shapes = ICONS.map(([, Icon]) => {
      const html = render(<Icon />).container.innerHTML;
      cleanup();
      return html;
    });
    expect(new Set(shapes).size).toBe(ICONS.length);
  });

  it("does not draw Leads as a funnel, which already means Filter in the same viewport", () => {
    const leads = render(<LeadsIcon />).container.querySelector("svg");
    cleanup();
    const filter = render(<Filter />).container.querySelector("svg");
    expect(leads?.getAttribute("class")).toContain("lucide-sprout");
    expect(leads?.getAttribute("class")).not.toContain("lucide-filter");
    expect(leads?.innerHTML).not.toBe(filter?.innerHTML);
  });
});
