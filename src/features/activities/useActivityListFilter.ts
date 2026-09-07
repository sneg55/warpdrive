"use client";
import { type Dispatch, type SetStateAction, useState } from "react";
import { type PresetRange, presetRange } from "./activityDatePresets";
import type { ActivityListFilter } from "./schemas";
import { useLocalNow } from "./useLocalNow";

const UNRESOLVED_RANGE: PresetRange = { from: null, to: null };

export interface ActivityListFilterState {
  filter: ActivityListFilter;
  setFilter: Dispatch<SetStateAction<ActivityListFilter | null>>;
  ready: boolean;
}

function defaultFilter(currentUserId: string, range: PresetRange): ActivityListFilter {
  return { ownerId: currentUserId, done: "open", from: range.from, to: range.to, typeKey: null };
}

export function useActivityListFilter(currentUserId: string): ActivityListFilterState {
  const localNow = useLocalNow();
  const [chosen, setChosen] = useState<ActivityListFilter | null>(null);
  if (chosen !== null) return { filter: chosen, setFilter: setChosen, ready: true };
  if (localNow === null) {
    return {
      filter: defaultFilter(currentUserId, UNRESOLVED_RANGE),
      setFilter: setChosen,
      ready: false,
    };
  }
  return {
    filter: defaultFilter(currentUserId, presetRange("today", localNow)),
    setFilter: setChosen,
    ready: true,
  };
}
