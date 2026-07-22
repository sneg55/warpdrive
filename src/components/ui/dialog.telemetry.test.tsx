// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

const { captureMock } = vi.hoisted(() => ({ captureMock: vi.fn() }));
vi.mock("@/features/observability/capture", () => ({
  capture: captureMock,
  currentRoute: () => "/p",
}));

import { Dialog, DialogContent, DialogTitle } from "./dialog";

afterEach(() => vi.clearAllMocks());

it("emits modal_opened on mount when defaultOpen and modal_closed with escape reason", async () => {
  const user = userEvent.setup();
  render(
    <Dialog defaultOpen>
      <DialogContent>
        <DialogTitle>t</DialogTitle>
      </DialogContent>
    </Dialog>,
  );
  await screen.findByText("t");
  expect(captureMock).toHaveBeenCalledWith(
    "modal_opened",
    expect.objectContaining({ route: "/p" }),
  );
  captureMock.mockClear();
  await user.keyboard("{Escape}");
  expect(captureMock).toHaveBeenCalledWith(
    "modal_closed",
    expect.objectContaining({ reason: "escape" }),
  );
});

it("emits lifecycle for a CONTROLLED dialog when the open prop flips (state-driven)", () => {
  // Radix onOpenChange does not fire when a parent flips `open`, so this exercises the
  // effect-based lifecycle: a state-driven open and a programmatic (parent-state) close, which is
  // the "modal closing when it should not" case the feature exists to surface.
  const content = (
    <DialogContent>
      <DialogTitle>c</DialogTitle>
    </DialogContent>
  );
  const { rerender } = render(
    <Dialog open={false} onOpenChange={() => {}}>
      {content}
    </Dialog>,
  );
  expect(captureMock).not.toHaveBeenCalledWith("modal_opened", expect.anything());

  rerender(
    <Dialog open={true} onOpenChange={() => {}}>
      {content}
    </Dialog>,
  );
  expect(captureMock).toHaveBeenCalledWith(
    "modal_opened",
    expect.objectContaining({ route: "/p" }),
  );

  captureMock.mockClear();
  rerender(
    <Dialog open={false} onOpenChange={() => {}}>
      {content}
    </Dialog>,
  );
  expect(captureMock).toHaveBeenCalledWith(
    "modal_closed",
    expect.objectContaining({ reason: "programmatic" }),
  );
});

it("emits modal_closed for a controlled dialog that UNMOUNTS on close (escape)", async () => {
  // The conditionally-mounted controlled pattern ({open && <Dialog open ...>}): closing removes the
  // dialog from the tree, so the [open] effect never re-renders with open=false. The close must be
  // emitted in the open-change callback, before the parent unmounts us. This is the GlobalNoteModal /
  // convert / merge shape the review flagged as losing modal_closed entirely.
  const user = userEvent.setup();
  function Harness(): ReactNode {
    const [open, setOpen] = useState(true);
    if (!open) return null;
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>u</DialogTitle>
        </DialogContent>
      </Dialog>
    );
  }
  render(<Harness />);
  await screen.findByText("u");
  captureMock.mockClear();
  await user.keyboard("{Escape}");
  const closes = captureMock.mock.calls.filter((c) => c[0] === "modal_closed");
  expect(closes).toHaveLength(1);
  expect(closes[0]?.[1]).toMatchObject({ reason: "escape" });
});

it("emits EXACTLY ONE modal_closed for an always-mounted controlled dialog (no double-emit)", async () => {
  // When the same interaction is observed by BOTH the callback and the [open] effect (dialog stays
  // mounted, open flips to false), prevOpen must dedup so we do not emit two modal_closed events.
  const user = userEvent.setup();
  function Harness(): ReactNode {
    const [open, setOpen] = useState(true);
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>m</DialogTitle>
        </DialogContent>
      </Dialog>
    );
  }
  render(<Harness />);
  await screen.findByText("m");
  captureMock.mockClear();
  await user.keyboard("{Escape}");
  const closes = captureMock.mock.calls.filter((c) => c[0] === "modal_closed");
  expect(closes).toHaveLength(1);
  expect(closes[0]?.[1]).toMatchObject({ reason: "escape" });
});
