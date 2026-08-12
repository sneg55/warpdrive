export const EVENTS = {
  actionFailed: "app_action_failed",
  notFound: "app_not_found",
  consoleForward: "client_console",
  modalOpened: "modal_opened",
  modalClosed: "modal_closed",
  boardDragStarted: "board_drag_started",
  boardDragEnded: "board_drag_ended",
  boardDragCancelled: "board_drag_cancelled",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
