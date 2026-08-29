// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import type { ContactPoint } from "@/types/contactPoint";
import { ContactPointsValue, contactPointsEditor } from "./ContactPointsField";
import { parsePoints, serializePoints } from "./contactPoints";

afterEach(cleanup);

const points: ContactPoint[] = [
  { label: "work", value: "pat@ottawa.ca", primary: true },
  { label: "home", value: "pat.home@gmail.com", primary: false },
];

it("renders every stored address as its own mailto link", () => {
  render(<ContactPointsValue points={points} kind="Email" />);
  expect(screen.getByRole("link", { name: "pat@ottawa.ca" })).toHaveAttribute(
    "href",
    "mailto:pat@ottawa.ca",
  );
  expect(screen.getByRole("link", { name: "pat.home@gmail.com" })).toHaveAttribute(
    "href",
    "mailto:pat.home@gmail.com",
  );
});

it("renders every stored number as its own tel link", () => {
  render(
    <ContactPointsValue
      points={[
        { label: "work", value: "+1 555 000 1111", primary: true },
        { label: "home", value: "+1 555 222 3333", primary: false },
      ]}
      kind="Phone"
    />,
  );
  expect(screen.getByRole("link", { name: "+1 555 000 1111" })).toHaveAttribute(
    "href",
    "tel:+15550001111",
  );
  expect(screen.getByRole("link", { name: "+1 555 222 3333" })).toBeInTheDocument();
});

function Harness({ initial }: { initial: ContactPoint[] }): React.ReactNode {
  const [draft, setDraft] = useState(serializePoints(initial));
  const editor = contactPointsEditor("Email");
  return (
    <div>
      {editor({ draft, setDraft })}
      <output data-testid="draft">{draft}</output>
    </div>
  );
}

const draftPoints = (): ContactPoint[] =>
  parsePoints(screen.getByTestId("draft").textContent ?? "");

it("opens one input per stored address so a second address is editable", () => {
  render(<Harness initial={points} />);
  expect(screen.getByLabelText("Email 1")).toHaveValue("pat@ottawa.ca");
  expect(screen.getByLabelText("Email 2")).toHaveValue("pat.home@gmail.com");
});

it("edits the second address without touching the first", () => {
  render(<Harness initial={points} />);
  fireEvent.change(screen.getByLabelText("Email 2"), { target: { value: "pat@work.ca" } });
  expect(draftPoints().map((p) => p.value)).toEqual(["pat@ottawa.ca", "pat@work.ca"]);
});

it("appends a blank row and removes a row", () => {
  render(<Harness initial={points} />);
  fireEvent.click(screen.getByRole("button", { name: "+ Add email" }));
  expect(screen.getByLabelText("Email 3")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Remove email 1" }));
  expect(draftPoints().map((p) => p.value)).toEqual(["pat.home@gmail.com", ""]);
});

it("promotes another address to primary", () => {
  render(<Harness initial={points} />);
  fireEvent.click(screen.getByRole("radio", { name: "Make email 2 primary" }));
  expect(draftPoints().map((p) => p.primary)).toEqual([false, true]);
});

it("offers a single blank row when the record holds nothing", () => {
  render(<Harness initial={[]} />);
  expect(screen.getByLabelText("Email 1")).toHaveValue("");
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
});

it("renders duplicate addresses as separate rows (merge can leave two of the same)", () => {
  const dupes: ContactPoint[] = [
    { label: "work", value: "same@x.com", primary: true },
    { label: "work", value: "same@x.com", primary: false },
  ];
  render(<ContactPointsValue points={dupes} kind="Email" />);
  expect(screen.getAllByRole("link", { name: "same@x.com" })).toHaveLength(2);
});

it("locks the rows while a save is in flight", () => {
  const editor = contactPointsEditor("Email");
  render(
    <div>{editor({ draft: serializePoints(points), setDraft: () => {}, disabled: true })}</div>,
  );
  expect(screen.getByLabelText("Email 1")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Remove email 1" })).toBeDisabled();
  expect(screen.getByRole("radio", { name: "Make email 2 primary" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "+ Add email" })).toBeDisabled();
});
