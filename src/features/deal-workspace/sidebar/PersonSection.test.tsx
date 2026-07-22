// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Person } from "@/db/schema";

// Stub the heavy field-grid block and the labels control so this test isolates the section's own
// wiring decision: does it render the (opt-in) labels control, with the right entity + labels?
vi.mock("./PersonBlock", () => ({ PersonBlock: () => <div data-testid="person-block" /> }));
vi.mock("@/features/contacts/ContactLabelsControl", () => ({
  ContactLabelsControl: (props: { entityType: string; entityId: string; labels: string[] }) => (
    <div data-testid="labels-control">
      {props.entityType}:{props.entityId}:{props.labels.join(",")}
    </div>
  ),
}));

import { PersonSection } from "./PersonSection";

const person = { id: "p1", labels: ["Hot"] } as unknown as Person;
const base = {
  person,
  menuItems: [],
  bulkEditing: false,
  onStartBulk: () => {},
  onExitBulk: () => {},
};

afterEach(cleanup);

it("renders the person labels control when labels are opted in", () => {
  render(<PersonSection {...base} showLabels />);
  const control = screen.getByTestId("labels-control");
  expect(control).toHaveTextContent("person:p1:Hot");
});

it("omits the labels control by default (contact-detail keeps its header control)", () => {
  render(<PersonSection {...base} />);
  expect(screen.queryByTestId("labels-control")).not.toBeInTheDocument();
});
