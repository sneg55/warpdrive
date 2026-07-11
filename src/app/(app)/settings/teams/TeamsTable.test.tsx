// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TeamsTable } from "./TeamsTable";

afterEach(cleanup);

const ALICE = { id: "11111111-1111-1111-1111-111111111111", name: "Alice Manager" };
const BOB = { id: "22222222-2222-2222-2222-222222222222", name: "Bob Member" };
const USERS = [ALICE, BOB];

describe("TeamsTable", () => {
  it("renders the manager's name, not the raw managerId", () => {
    render(<TeamsTable teams={[{ id: "t1", name: "Sales", managerId: ALICE.id }]} users={USERS} />);
    expect(screen.getByText("Alice Manager")).toBeInTheDocument();
    expect(screen.queryByText(ALICE.id)).not.toBeInTheDocument();
  });

  it("renders None when a team has no manager", () => {
    render(<TeamsTable teams={[{ id: "t2", name: "Ops", managerId: null }]} users={USERS} />);
    expect(screen.getByText("None")).toBeInTheDocument();
  });
});
