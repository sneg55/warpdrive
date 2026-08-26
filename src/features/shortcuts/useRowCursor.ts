"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { nextCursorIndex } from "./rowCursor";
import { isOverlayOpen, isTypingTarget } from "./shortcutTarget";

// Enter belongs to whatever the user has focused; only a keypress with nothing interactive focused
// should reach the row cursor.
const INTERACTIVE = "a,button,input,select,textarea,[role='button'],[role='link'],[tabindex]";

function ownsEnter(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest(INTERACTIVE) !== null;
}

// Pipedrive's j/k list browsing: j moves the cursor down a row, k up, Enter opens the row under it.
// `count` is the number of rows currently listed; the cursor clamps when that shrinks under it, so
// a filter change never leaves it pointing past the end.
export function useRowCursor(count: number, onActivate: (index: number) => void): number | null {
  const [index, setIndex] = useState<number | null>(null);
  const activate = useRef(onActivate);
  useEffect(() => {
    activate.current = onActivate;
  }, [onActivate]);

  const cursor = index === null || count === 0 ? null : Math.min(index, count - 1);

  const move = useCallback(
    (delta: 1 | -1) => {
      setIndex((prev) =>
        nextCursorIndex(prev === null ? null : Math.min(prev, count - 1), count, delta),
      );
    },
    [count],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target) || isOverlayOpen(document)) return;
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        move(e.key === "j" ? 1 : -1);
        return;
      }
      if (e.key === "Enter" && cursor !== null && !ownsEnter(e.target)) {
        e.preventDefault();
        activate.current(cursor);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cursor, move]);

  return cursor;
}
