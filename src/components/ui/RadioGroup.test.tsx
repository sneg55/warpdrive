// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { RadioGroup, RadioGroupItem } from "./RadioGroup";

afterEach(cleanup);

function Harness(): React.ReactNode {
  const [value, setValue] = useState("comfortable");
  return (
    <RadioGroup value={value} onValueChange={setValue} aria-label="Density">
      <RadioGroupItem value="comfortable" aria-label="Comfortable" />
      <RadioGroupItem value="compact" aria-label="Compact" />
    </RadioGroup>
  );
}

describe("RadioGroup", () => {
  it("marks the current value as checked", () => {
    render(<Harness />);
    expect(screen.getByRole("radio", { name: "Comfortable" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Compact" })).not.toBeChecked();
  });

  it("selects a different option on click", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "Compact" }));
    expect(screen.getByRole("radio", { name: "Compact" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Comfortable" })).not.toBeChecked();
  });

  it("renders custom content in place of the dot when children are given", () => {
    render(
      <RadioGroup value="qualified" onValueChange={() => undefined} aria-label="Stage">
        <RadioGroupItem value="qualified" aria-label="Qualified">
          Qualified
        </RadioGroupItem>
      </RadioGroup>,
    );
    // The segment renders its own label text (not just an aria-label + dot), so a
    // clip-path chevron stage picker can use it without a stray radio dot.
    expect(screen.getByRole("radio", { name: "Qualified" })).toHaveTextContent("Qualified");
  });
});
