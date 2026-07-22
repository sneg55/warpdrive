// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { STRINGS } from "@/constants/strings";
import { ReorderControls } from "./ReorderControls";

describe("ReorderControls", () => {
  it("renders accessible arrow controls and preserves boundary states", () => {
    const onMoveUp = vi.fn();
    const onMoveDown = vi.fn();
    const { getByRole } = render(
      <ReorderControls canMoveUp={false} canMoveDown onMoveUp={onMoveUp} onMoveDown={onMoveDown} />,
    );

    const moveUp = getByRole("button", { name: STRINGS.settings.moveUp });
    const moveDown = getByRole("button", { name: STRINGS.settings.moveDown });
    expect(moveUp).toBeDisabled();
    expect(moveUp).not.toHaveTextContent(STRINGS.settings.moveUp);
    expect(moveUp.querySelector("svg")).toBeInTheDocument();
    expect(moveDown).toBeEnabled();
    expect(moveDown).not.toHaveTextContent(STRINGS.settings.moveDown);
    expect(moveDown.querySelector("svg")).toBeInTheDocument();

    fireEvent.click(moveDown);
    expect(onMoveDown).toHaveBeenCalledOnce();
    expect(onMoveUp).not.toHaveBeenCalled();
  });
});
