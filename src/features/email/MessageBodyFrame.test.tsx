// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

// Security + layout contract: email HTML is rendered inside a sandboxed iframe. The sandbox
// grants allow-same-origin ONLY (never allow-scripts): with scripts disabled no code can
// execute, so a sanitizer miss still cannot reach the app, cookies, or session. same-origin
// is required so onLoad can read the laid-out document height and size the frame to its
// content instead of collapsing to a fixed default.
import { MessageBodyFrame } from "./MessageBodyFrame";

describe("MessageBodyFrame", () => {
  it("renders the body in an iframe sandboxed with allow-same-origin but NOT allow-scripts", () => {
    const { container } = render(
      <MessageBodyFrame html="<p>safe</p>" allowRemote={false} onShowRemote={() => {}} />,
    );
    const iframe = container.querySelector("iframe");
    expect(iframe).toBeTruthy();
    const sandbox = iframe?.getAttribute("sandbox") ?? "";
    expect(sandbox).toMatch(/allow-same-origin/);
    expect(sandbox).not.toMatch(/allow-scripts/);
  });

  it("gives the iframe a min-height so a short body does not collapse", () => {
    const { container } = render(
      <MessageBodyFrame html="<p>x</p>" allowRemote={false} onShowRemote={() => {}} />,
    );
    const iframe = container.querySelector("iframe");
    expect(iframe?.style.minHeight).not.toBe("");
  });

  it("sizes the iframe to contentDocument.body.scrollHeight on load", () => {
    const { container } = render(
      <MessageBodyFrame html="<p>tall</p>" allowRemote={false} onShowRemote={() => {}} />,
    );
    const iframe = container.querySelector("iframe");
    if (iframe === null) throw new Error("no iframe");
    // jsdom cannot lay out iframes, so drive the handler with a mocked contentDocument.
    Object.defineProperty(iframe, "contentDocument", {
      configurable: true,
      value: { body: { scrollHeight: 742 } },
    });
    fireEvent.load(iframe);
    expect(iframe.style.height).toBe("742px");
  });

  it("does not throw and keeps the min-height when contentDocument is null on load", () => {
    const { container } = render(
      <MessageBodyFrame html="<p>x</p>" allowRemote={false} onShowRemote={() => {}} />,
    );
    const iframe = container.querySelector("iframe");
    if (iframe === null) throw new Error("no iframe");
    Object.defineProperty(iframe, "contentDocument", { configurable: true, value: null });
    expect(() => fireEvent.load(iframe)).not.toThrow();
    expect(iframe.style.minHeight).not.toBe("");
    expect(iframe.style.height).toBe("");
  });

  it("offers a show-remote-content affordance when remote is blocked", () => {
    const { getByRole } = render(
      <MessageBodyFrame html="<p>x</p>" allowRemote={false} onShowRemote={() => {}} />,
    );
    expect(getByRole("button", { name: /show remote content/i })).toBeTruthy();
  });
});
