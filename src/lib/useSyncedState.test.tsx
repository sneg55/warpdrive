// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useSyncedState } from "./useSyncedState";

afterEach(cleanup);

function Probe({ source }: { source: string }) {
  const [value, setValue] = useSyncedState(source);
  return (
    <div>
      <span data-testid="value">{value}</span>
      <button type="button" onClick={() => setValue("edited")}>
        edit
      </button>
    </div>
  );
}

describe("useSyncedState", () => {
  it("starts at the source value", () => {
    render(<Probe source="a" />);
    expect(screen.getByTestId("value").textContent).toBe("a");
  });

  it("keeps local edits while the source is unchanged", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Probe source="a" />);
    await user.click(screen.getByRole("button", { name: "edit" }));
    expect(screen.getByTestId("value").textContent).toBe("edited");

    // A re-render with the SAME source must not clobber the local edit.
    rerender(<Probe source="a" />);
    expect(screen.getByTestId("value").textContent).toBe("edited");
  });

  it("re-syncs when the source changes, discarding the local edit", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Probe source="a" />);
    await user.click(screen.getByRole("button", { name: "edit" }));
    expect(screen.getByTestId("value").textContent).toBe("edited");

    rerender(<Probe source="b" />);
    expect(screen.getByTestId("value").textContent).toBe("b");
  });

  it("re-syncs back to a source it held before, not just to new values", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Probe source="a" />);
    rerender(<Probe source="b" />);
    await user.click(screen.getByRole("button", { name: "edit" }));
    rerender(<Probe source="a" />);
    expect(screen.getByTestId("value").textContent).toBe("a");
  });
});
