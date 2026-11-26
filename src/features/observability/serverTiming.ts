import { headers } from "next/headers";
import { after } from "next/server";
import { cache } from "react";
import { captureServerTiming, serverTelemetryEnabled } from "./server";
import { requestsNoTracking } from "./serverTimingPrivacy";
import { createTimingCollector, type TimingCollector } from "./timingCollector";

const requestCollector = cache(async (): Promise<TimingCollector | null> => {
  if (!serverTelemetryEnabled()) return null;
  if (requestsNoTracking(await headers())) return null;
  return createTimingCollector({
    kind: "page",
    now: () => performance.now(),
    schedule: after,
    onFinish: captureServerTiming,
  });
});

export async function timingRoute(route: string): Promise<void> {
  (await requestCollector())?.labelRoute(route);
}

export async function timed<T>(name: string, work: () => Promise<T>): Promise<T> {
  const collector = await requestCollector();
  return collector === null ? work() : collector.timed(name, work);
}
