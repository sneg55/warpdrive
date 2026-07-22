import { expect, it } from "vitest";
import { EVENTS } from "./events";

it("exposes the stable event names", () => {
  expect(EVENTS.actionFailed).toBe("app_action_failed");
  expect(EVENTS.consoleForward).toBe("client_console");
  expect(EVENTS.modalOpened).toBe("modal_opened");
  expect(EVENTS.modalClosed).toBe("modal_closed");
  expect(EVENTS.boardDragStarted).toBe("board_drag_started");
  expect(EVENTS.boardDragEnded).toBe("board_drag_ended");
  expect(EVENTS.boardDragCancelled).toBe("board_drag_cancelled");
});
