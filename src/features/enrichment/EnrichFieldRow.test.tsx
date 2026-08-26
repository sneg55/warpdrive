// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { EnrichFieldRow } from "./EnrichFieldRow";
import type { ProposedField } from "./types";

afterEach(cleanup);

const agreed: ProposedField = {
  canonicalKey: "person.title",
  label: "Job title",
  values: [{ value: "Head of Growth", providers: ["apollo", "rocketreach"] }],
  selectedValue: "Head of Growth",
  currentValue: null,
  isOverwrite: false,
  currentInvalid: false,
  supportsPrimary: false,
  defaultMakePrimary: false,
  defaultSelected: true,
};

const contested: ProposedField = {
  canonicalKey: "person.linkedinUrl",
  label: "LinkedIn",
  values: [
    { value: "/in/janedoe", providers: ["apollo"] },
    { value: "/in/jane-doe-9", providers: ["rocketreach"] },
  ],
  selectedValue: "/in/janedoe",
  currentValue: null,
  isOverwrite: false,
  currentInvalid: false,
  supportsPrimary: false,
  defaultMakePrimary: false,
  defaultSelected: true,
};

it("shows the label, the value, and every contributing provider", () => {
  render(
    <EnrichFieldRow
      field={agreed}
      checked
      selectedValue="Head of Growth"
      onCheckedChange={() => {}}
      onValueChange={() => {}}
      makePrimary={false}
      onMakePrimaryChange={() => {}}
    />,
  );
  expect(screen.getByText("Job title")).toBeInTheDocument();
  expect(screen.getByText("Head of Growth")).toBeInTheDocument();
  expect(screen.getByText("apollo, rocketreach")).toBeInTheDocument();
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
});

it("reports a toggled checkbox", async () => {
  const user = userEvent.setup();
  const onCheckedChange = vi.fn();
  render(
    <EnrichFieldRow
      field={agreed}
      checked
      selectedValue="Head of Growth"
      onCheckedChange={onCheckedChange}
      onValueChange={() => {}}
      makePrimary={false}
      onMakePrimaryChange={() => {}}
    />,
  );
  await user.click(screen.getByRole("checkbox", { name: "Job title" }));
  expect(onCheckedChange).toHaveBeenCalledWith(false);
});

it("offers a radio per variant when providers disagree and reports the pick", async () => {
  const user = userEvent.setup();
  const onValueChange = vi.fn();
  render(
    <EnrichFieldRow
      field={contested}
      checked
      selectedValue="/in/janedoe"
      onCheckedChange={() => {}}
      onValueChange={onValueChange}
      makePrimary={false}
      onMakePrimaryChange={() => {}}
    />,
  );
  expect(screen.getByText(ENRICHMENT_STRINGS.dialog.pickOne)).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "/in/janedoe" })).toBeChecked();
  await user.click(screen.getByRole("radio", { name: "/in/jane-doe-9" }));
  expect(onValueChange).toHaveBeenCalledWith("/in/jane-doe-9");
});

it("names the value an overwrite would replace", () => {
  render(
    <EnrichFieldRow
      field={{
        ...agreed,
        canonicalKey: "person.location",
        label: "Location",
        values: [{ value: "San Francisco, CA", providers: ["apollo"] }],
        selectedValue: "San Francisco, CA",
        currentValue: "SF",
        isOverwrite: true,
        currentInvalid: false,
        supportsPrimary: false,
        defaultMakePrimary: false,
        defaultSelected: false,
      }}
      checked={false}
      selectedValue="San Francisco, CA"
      onCheckedChange={() => {}}
      onValueChange={() => {}}
      makePrimary={false}
      onMakePrimaryChange={() => {}}
    />,
  );
  expect(screen.getByRole("checkbox", { name: "Location" })).not.toBeChecked();
  expect(screen.getByText(ENRICHMENT_STRINGS.dialog.overwrites("SF"))).toBeInTheDocument();
});

// A person linked to an organization outside the actor's visibility. The row must not read as an
// empty field, and it must not name the value it cannot show either.
it("warns that an overwrite replaces something it cannot show", () => {
  render(
    <EnrichFieldRow
      field={{
        canonicalKey: "person.companyName",
        label: "Company",
        values: [{ value: "Initech", providers: ["apollo"] }],
        selectedValue: "Initech",
        currentValue: null,
        isOverwrite: true,
        currentInvalid: false,
        supportsPrimary: false,
        defaultMakePrimary: false,
        defaultSelected: false,
      }}
      checked={false}
      selectedValue="Initech"
      onCheckedChange={() => undefined}
      onValueChange={() => undefined}
      makePrimary={false}
      onMakePrimaryChange={() => {}}
    />,
  );

  expect(screen.getByText(ENRICHMENT_STRINGS.dialog.overwritesHidden)).toBeInTheDocument();
});
