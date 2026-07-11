// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppNotFound from "./(app)/not-found";
import GlobalError from "./global-error";

afterEach(cleanup);

// global-error.tsx is the only boundary that catches a throw from the ROOT layout. React replaces
// the whole document with it, so it must render its own <html>/<body> and cannot rely on Providers,
// the nav, or anything else from the app shell.
describe("global error boundary", () => {
  it("renders its own html and body because it replaces the document", () => {
    const { container } = render(<GlobalError error={new Error("boom")} reset={vi.fn()} />, {
      // React refuses to mount <html> inside a <div>; mount into a detached document element.
      container: document.documentElement,
    });
    expect(container.querySelector("body")).not.toBeNull();
  });

  it("shows the digest when Next supplies one", () => {
    render(
      <GlobalError
        error={Object.assign(new Error("boom"), { digest: "abc123" })}
        reset={vi.fn()}
      />,
      { container: document.documentElement },
    );
    expect(screen.getByText(/abc123/)).not.toBeNull();
  });
});

// notFound() is already thrown by the deal, person and org pages. Without this file the user lands
// on Next's stock page with none of the app chrome.
describe("(app) not-found boundary", () => {
  it("explains that the record is missing or not visible, and offers a way out", () => {
    render(<AppNotFound />);
    expect(screen.getByRole("heading").textContent).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/pipeline");
  });
});
