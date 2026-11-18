// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppSegmentError from "./error";

afterEach(cleanup);

describe("(app) error boundary", () => {
  it("tells the user something broke rather than showing a blank screen", () => {
    render(<AppSegmentError error={new Error("boom")} reset={vi.fn()} />);
    expect(screen.getByRole("heading").textContent).toBeTruthy();
  });

  it("surfaces the error digest so a server log can be found", () => {
    const error = Object.assign(new Error("boom"), { digest: "1234567890" });
    render(<AppSegmentError error={error} reset={vi.fn()} />);
    expect(screen.getByText(/1234567890/)).not.toBeNull();
  });

  it("omits the digest line entirely when Next did not supply one", () => {
    render(<AppSegmentError error={new Error("boom")} reset={vi.fn()} />);
    expect(screen.queryByTestId("error-digest")).toBeNull();
  });

  it("retries the segment when the user asks to try again", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    render(<AppSegmentError error={new Error("boom")} reset={reset} />);
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
