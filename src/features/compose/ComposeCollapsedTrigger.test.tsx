// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComposeCollapsedTrigger } from "./ComposeCollapsedTrigger";

afterEach(cleanup);

// The editor is loaded lazily and autofocuses itself once it mounts. If a user clicks the prompt
// and starts typing before the chunk arrives, those keystrokes land nowhere. Preloading on the
// first hint of intent (hover or keyboard focus) means the chunk is normally already warm.
describe("ComposeCollapsedTrigger preloading", () => {
  it("does not preload the editor on render alone", () => {
    const onPreload = vi.fn();
    render(
      <ComposeCollapsedTrigger label="Take a note..." onExpand={vi.fn()} onPreload={onPreload} />,
    );
    expect(onPreload).not.toHaveBeenCalled();
  });

  it("preloads the editor when the pointer enters the prompt", async () => {
    const user = userEvent.setup();
    const onPreload = vi.fn();
    render(
      <ComposeCollapsedTrigger label="Take a note..." onExpand={vi.fn()} onPreload={onPreload} />,
    );
    await user.hover(screen.getByRole("button", { name: "Take a note..." }));
    expect(onPreload).toHaveBeenCalled();
  });

  it("preloads the editor when the prompt receives keyboard focus", async () => {
    const user = userEvent.setup();
    const onPreload = vi.fn();
    render(
      <ComposeCollapsedTrigger label="Take a note..." onExpand={vi.fn()} onPreload={onPreload} />,
    );
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Take a note..." }));
    expect(onPreload).toHaveBeenCalled();
  });

  it("still expands on click", async () => {
    const user = userEvent.setup();
    const onExpand = vi.fn();
    render(
      <ComposeCollapsedTrigger label="Take a note..." onExpand={onExpand} onPreload={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: "Take a note..." }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });
});
