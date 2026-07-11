"use client";
import { type Dispatch, type SetStateAction, useState } from "react";

/**
 * Local state that re-seeds itself whenever `source` changes.
 *
 * The obvious spelling of this is `useEffect(() => setValue(source), [source])`, which is the
 * anti-pattern react-hooks/set-state-in-effect exists to catch: it renders once with the stale
 * value, runs the effect, then renders again. Adjusting state during render instead means React
 * discards the in-progress render and retries immediately, so the stale value never reaches the DOM
 * and no extra commit happens. This is React's documented "adjusting state when a prop changes".
 *
 * Comparison is Object.is, so a source that is a fresh array/object on every parent render will
 * re-seed every time and stomp local edits. Callers passing collections must either memoize the
 * source or pass a stable identity (in this codebase those props come from server components, whose
 * identity only changes on an actual refresh).
 */
export function useSyncedState<T>(source: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(source);
  const [seenSource, setSeenSource] = useState(source);

  if (!Object.is(seenSource, source)) {
    setSeenSource(source);
    setValue(source);
  }

  return [value, setValue];
}
