"use client";
import { type Dispatch, type SetStateAction, useState } from "react";

export function useSyncedState<T>(source: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(source);
  const [seenSource, setSeenSource] = useState(source);

  if (!Object.is(seenSource, source)) {
    setSeenSource(source);
    setValue(source);
  }

  return [value, setValue];
}
