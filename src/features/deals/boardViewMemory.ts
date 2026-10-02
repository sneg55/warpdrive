import type { BoardViewState } from "./boardView";

let lastView: BoardViewState | null = null;

export function rememberBoardView(view: BoardViewState): void {
  lastView = view;
}

export function recallBoardView(): BoardViewState | null {
  return lastView;
}

export function forgetBoardView(): void {
  lastView = null;
}
