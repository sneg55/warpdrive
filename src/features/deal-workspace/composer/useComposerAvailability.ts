"use client";
import { trpc } from "@/lib/trpc-client";
import { availabilityWindow } from "./composerHelpers";

interface Params {
  ownerId: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}

// Live Free/Busy signal for the composer: queries whether the assignee is already booked in the
// activity's [start, end] window. The window is the composed start (dueAt) to the composed end
// (endAt when a multi-day end date is set, else the start again). Disabled until a start exists.
export function useComposerAvailability({
  ownerId,
  startDate,
  startTime,
  endDate,
  endTime,
}: Params): boolean {
  const { from, to } = availabilityWindow(startDate, startTime, endDate, endTime);
  const q = trpc.activities.availability.useQuery(
    { userId: ownerId === "" ? null : ownerId, from: from ?? "", to: to ?? from ?? "" },
    { enabled: from !== null },
  );
  return q.data?.busy ?? false;
}
