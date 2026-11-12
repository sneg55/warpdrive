"use client";
import { type Dispatch, type SetStateAction, useState } from "react";
import { DEFAULT_ACTIVITY_DATE_BASIS } from "@/constants/activityDateBasis";
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
  return {
    ownerId: currentUserId,
    done: "open",
    from: range.from,
    to: range.to,
    dateBasis: DEFAULT_ACTIVITY_DATE_BASIS,
    pipelineId: null,
    typeKey: null,
  };
}

export function useActivityListFilter(
  currentUserId: string,
  seed: ActivityListFilter | null = null,
): ActivityListFilterState {
  const localNow = useLocalNow();
  const [chosen, setChosen] = useState<ActivityListFilter | null>(seed);
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
