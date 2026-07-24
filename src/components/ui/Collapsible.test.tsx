// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./Collapsible";

it("wires disclosure state and keyboard activation through Radix", async () => {
  render(
    <Collapsible>
      <CollapsibleTrigger>Edit options</CollapsibleTrigger>
      <CollapsibleContent>Option editor</CollapsibleContent>
    </Collapsible>,
  );

  const trigger = screen.getByRole("button", { name: "Edit options" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("Option editor")).not.toBeInTheDocument();

  trigger.focus();
  await userEvent.keyboard("{Enter}");
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("Option editor")).toBeVisible();
});
