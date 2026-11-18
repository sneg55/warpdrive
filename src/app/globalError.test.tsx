// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STRINGS } from "@/constants/strings";
import AppNotFound from "./(app)/not-found";
import GlobalError from "./global-error";

afterEach(cleanup);

describe("global error boundary", () => {
  it("renders its own html and body because it replaces the document", () => {
    const { container } = render(<GlobalError error={new Error("boom")} reset={vi.fn()} />, {
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

  it("uses the muted token for its body copy", () => {
    render(<GlobalError error={new Error("boom")} reset={vi.fn()} />, {
      container: document.documentElement,
    });
    expect(screen.getByText(STRINGS.errors.appCrashBody).className).toContain(
      "text-muted-foreground",
    );
  });
});

describe("(app) not-found boundary", () => {
  it("explains that the record is missing or not visible, and offers a way out", () => {
    render(<AppNotFound />);
    expect(screen.getByRole("heading").textContent).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/pipeline");
  });
});
