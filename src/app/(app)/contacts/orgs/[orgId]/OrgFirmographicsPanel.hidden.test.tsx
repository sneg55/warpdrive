// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("@/features/contacts/actions", () => ({ updateOrgAction: vi.fn() }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { OrgFirmographicsPanel } from "./OrgFirmographicsPanel";

const ORG = {
  id: "o1",
  domain: "acme.com",
  industry: "SaaS",
  employeeCount: 10,
  annualRevenue: "1000",
  linkedinUrl: "in/acme",
};

it("hides a built-in firmographic row when its key is hidden, keeps the rest", () => {
  render(<OrgFirmographicsPanel org={ORG} onSaved={vi.fn()} hidden={new Set(["industry"])} />);
  expect(screen.queryByText("Industry")).toBeNull();
  expect(screen.getByText("Website")).toBeTruthy();
  expect(screen.getByText("Employees")).toBeTruthy();
});

it("shows every row when nothing is hidden", () => {
  render(<OrgFirmographicsPanel org={ORG} onSaved={vi.fn()} />);
  expect(screen.getByText("Industry")).toBeTruthy();
  expect(screen.getByText("LinkedIn")).toBeTruthy();
});
