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
