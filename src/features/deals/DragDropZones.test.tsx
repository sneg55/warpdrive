// @vitest-environment jsdom
import { DndContext } from "@dnd-kit/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DragDropZones, zoneToStatus } from "./DragDropZones";

afterEach(cleanup);

// useDroppable needs a DndContext; the real Board renders the bar inside its own context.
function wrap(active: boolean) {
  return render(
    <DndContext>
      <DragDropZones active={active} />
    </DndContext>,
  );
}

describe("DragDropZones", () => {
  it("renders nothing when no drag is active", () => {
    const { container } = wrap(false);
    expect(container.querySelector("[data-drop-zone]")).toBeNull();
  });

  it("reveals the Lost/Won/Move action zones during a drag (no Delete drag target)", () => {
    wrap(true);
    for (const label of ["Lost", "Won", "Move"]) {
      expect(screen.getByText(label)).not.toBeNull();
    }
    // Delete is deliberately not a drag target (deletion is a confirmed menu action).
    expect(screen.queryByText("Delete")).toBeNull();
    expect(screen.getByRole("region", { name: "Deal drop actions" })).not.toBeNull();
  });

  it("maps the won/lost zones to a deal status and other targets to null", () => {
    expect(zoneToStatus("deal-zone-won")).toBe("won");
    expect(zoneToStatus("deal-zone-lost")).toBe("lost");
    // Move is not a status transition; neither is a stage id.
    expect(zoneToStatus("deal-zone-move")).toBeNull();
    expect(zoneToStatus("aaaaaaaa-0000-0000-0000-000000000001")).toBeNull();
  });
});
