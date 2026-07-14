// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Organization } from "@/db/schema";
import { HideEmptyContext } from "./sectionFilter";

const { refresh, updateOrgAction } = vi.hoisted(() => ({
  refresh: vi.fn(),
  updateOrgAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "o1" } })),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/features/contacts/actions", () => ({ updateOrgAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { OrgBlock } from "./OrgBlock";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Blank firmographics: every row but Name is value-less.
const blankOrg: Organization = {
  id: "o1",
  name: "Org One",
  domain: null,
  industry: null,
  employeeCount: null,
  annualRevenue: null,
  linkedinUrl: null,
  address: null,
} as unknown as Organization;

it("renders Website as an https link (adding scheme) and LinkedIn as its url, opening in a new tab", () => {
  const org = {
    ...blankOrg,
    domain: "uniondynamics.com",
    linkedinUrl: "https://www.linkedin.com/company/uniondynamics",
  } as unknown as Organization;
  render(<OrgBlock org={org} />);

  const website = screen.getByRole("link", { name: "uniondynamics.com" });
  expect(website).toHaveAttribute("href", "https://uniondynamics.com");
  expect(website).toHaveAttribute("target", "_blank");
  expect(website).toHaveAttribute("rel", "noopener noreferrer");

  const linkedin = screen.getByRole("link", {
    name: "https://www.linkedin.com/company/uniondynamics",
  });
  expect(linkedin).toHaveAttribute("href", "https://www.linkedin.com/company/uniondynamics");
});

it("shows blank firmographic rows when the section is not hiding empties", () => {
  render(
    <HideEmptyContext.Provider value={false}>
      <OrgBlock org={blankOrg} />
    </HideEmptyContext.Provider>,
  );
  expect(screen.getByText("Website")).toBeInTheDocument();
  expect(screen.getByText("LinkedIn")).toBeInTheDocument();
  expect(screen.getByText("Industry")).toBeInTheDocument();
  expect(screen.getByText("Annual revenue")).toBeInTheDocument();
  expect(screen.getByText("Number of employees")).toBeInTheDocument();
  expect(screen.getByText("Address")).toBeInTheDocument();
});

it("hides blank firmographic rows when the funnel is hiding empties", () => {
  render(
    <HideEmptyContext.Provider value={true}>
      <OrgBlock org={blankOrg} />
    </HideEmptyContext.Provider>,
  );
  expect(screen.queryByText("Website")).not.toBeInTheDocument();
  expect(screen.queryByText("LinkedIn")).not.toBeInTheDocument();
  expect(screen.queryByText("Industry")).not.toBeInTheDocument();
  expect(screen.queryByText("Annual revenue")).not.toBeInTheDocument();
  expect(screen.queryByText("Number of employees")).not.toBeInTheDocument();
  expect(screen.queryByText("Address")).not.toBeInTheDocument();
  // Name is never value-less; it always stays.
  expect(screen.getByText("Name")).toBeInTheDocument();
});

it("edits the Address as a composite of subfields, saving a merged address object", async () => {
  const org = {
    ...blankOrg,
    address: { street: "1 Main St", city: "Springfield" },
  } as unknown as Organization;
  render(<OrgBlock org={org} />);

  // A populated Address renders a formatted value + a pencil to open the composite editor.
  fireEvent.click(screen.getByRole("button", { name: "Edit Address" }));
  fireEvent.change(screen.getByLabelText("City"), { target: { value: "Portland" } });
  fireEvent.change(screen.getByLabelText("Postal code"), { target: { value: "97201" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(updateOrgAction).toHaveBeenCalledWith(
      {
        id: "o1",
        address: { street: "1 Main St", city: "Portland", postal: "97201" },
      },
      "csrf",
    ),
  );
});

it("a filled-in field stays visible even while the funnel is hiding empties", () => {
  render(
    <HideEmptyContext.Provider value={true}>
      <OrgBlock org={{ ...blankOrg, industry: "Media" }} />
    </HideEmptyContext.Provider>,
  );
  expect(screen.getByText("Industry")).toBeInTheDocument();
  expect(screen.queryByText("Website")).not.toBeInTheDocument();
});

// Built-in fields hidden in Settings > Data fields must not render here even when they hold a
// value (the deal sidebar previously ignored the hidden set that the org detail page respects).
it("hides a built-in firmographic row whose key is in the hidden set, keeps the rest", () => {
  const org = {
    ...blankOrg,
    domain: "acme.com",
    industry: "Media",
    annualRevenue: "1000000",
    employeeCount: 42,
  } as unknown as Organization;
  render(<OrgBlock org={org} hidden={new Set(["industry", "annualRevenue"])} />);

  expect(screen.queryByText("Industry")).not.toBeInTheDocument();
  expect(screen.queryByText("Annual revenue")).not.toBeInTheDocument();
  // Non-hidden rows still render.
  expect(screen.getByText("Website")).toBeInTheDocument();
  expect(screen.getByText("Number of employees")).toBeInTheDocument();
  expect(screen.getByText("Name")).toBeInTheDocument();
});

it("renders provided label chips under the section (PD's per-organization Labels row)", () => {
  render(
    <HideEmptyContext.Provider value={false}>
      <OrgBlock org={blankOrg} labels={[{ name: "Partner", classes: "bg-blue-100" }]} />
    </HideEmptyContext.Provider>,
  );
  expect(screen.getByText("Labels")).toBeInTheDocument();
  expect(screen.getByText("Partner")).toBeInTheDocument();
});
