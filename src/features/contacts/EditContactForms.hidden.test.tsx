// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AddressFields, PersonBaseFields } from "./EditContactForms";

afterEach(cleanup);

const noop = (): void => {};

it("hides the org select when 'org' is hidden, keeps email/phone", () => {
  render(
    <PersonBaseFields
      emails={[]}
      phones={[]}
      orgId=""
      orgOptions={[]}
      onEmails={noop}
      onPhones={noop}
      onOrgId={noop}
      hidden={new Set(["org"])}
    />,
  );
  expect(screen.queryByLabelText("Organization")).toBeNull();
  expect(screen.getByText("Email")).toBeTruthy();
  expect(screen.getByText("Phone")).toBeTruthy();
});

it("hides email rows when 'emails' is hidden", () => {
  render(
    <PersonBaseFields
      emails={[]}
      phones={[]}
      orgId=""
      orgOptions={[]}
      onEmails={noop}
      onPhones={noop}
      onOrgId={noop}
      hidden={new Set(["emails"])}
    />,
  );
  expect(screen.queryByText("Email")).toBeNull();
  expect(screen.getByText("Phone")).toBeTruthy();
});

it("shows all fields when nothing is hidden", () => {
  render(
    <PersonBaseFields
      emails={[]}
      phones={[]}
      orgId=""
      orgOptions={[]}
      onEmails={noop}
      onPhones={noop}
      onOrgId={noop}
    />,
  );
  expect(screen.getByText("Email")).toBeTruthy();
  expect(screen.getByLabelText("Organization")).toBeTruthy();
});

it("labels and inputs use theme tokens, so a Night form is not a white box", () => {
  render(<AddressFields value={{}} onChange={noop} />);
  const legend = screen.getByText("Address");
  expect(legend).toHaveClass("text-muted-foreground");
  const street = screen.getByLabelText("Street");
  expect(street).toHaveClass("bg-background", "text-foreground");
  expect(street.className).not.toMatch(/-gray-/);
});
