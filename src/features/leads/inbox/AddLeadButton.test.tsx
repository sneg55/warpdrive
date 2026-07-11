// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("../AddLeadModal", () => ({ AddLeadModal: () => null }));

import { AddLeadButton } from "./AddLeadButton";

it("exposes an Import leads link to the import route when the user can import", async () => {
  const user = userEvent.setup();
  render(<AddLeadButton onCreated={vi.fn()} canImport={true} />);
  await user.click(screen.getByRole("button", { name: "Add lead options" }));
  const link = screen.getByRole("menuitem", { name: "Import leads" });
  // The wizard moved to /settings/import/new (/settings/import is now the history list).
  expect(link).toHaveAttribute("href", "/settings/import/new");
});

it("hides the Import leads link when the user lacks the import permission", async () => {
  // Mirrors SettingsNav, which omits the entry: no dead-end link to a denial page.
  const user = userEvent.setup();
  render(<AddLeadButton onCreated={vi.fn()} canImport={false} />);
  await user.click(screen.getByRole("button", { name: "Add lead options" }));
  expect(screen.getByRole("menuitem", { name: "New lead" })).toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: "Import leads" })).not.toBeInTheDocument();
});
