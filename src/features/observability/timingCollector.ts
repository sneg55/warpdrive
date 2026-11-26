import type { ServerTimingEvent, TimingSpan } from "./server";

export interface TimingCollector {
  labelRoute: (route: string) => void;
  timed: <T>(name: string, work: () => Promise<T>) => Promise<T>;
}

interface CollectorDeps {
  kind: ServerTimingEvent["kind"];
  now: () => number;
  schedule: (flush: () => void) => void;
  onFinish: (event: ServerTimingEvent) => void;
}

const UNLABELLED_ROUTE = "unknown";

function toTenths(ms: number): number {
  return Math.round(ms * 10) / 10;
}

export function createTimingCollector(deps: CollectorDeps): TimingCollector {
  const origin = deps.now();
  const spans: Record<string, TimingSpan> = {};
  let route = UNLABELLED_ROUTE;
  let flushScheduled = false;
  let inFlight = 0;

  const scheduleFlush = (): void => {
    if (flushScheduled) return;
    flushScheduled = true;
    deps.schedule(() => {
      deps.onFinish({
        kind: deps.kind,
        route,
        incomplete: inFlight > 0,
        total_ms: toTenths(deps.now() - origin),
        spans: { ...spans },
      });
    });
  };

  const record = (name: string, span: TimingSpan): void => {
    const existing = spans[name];
    if (existing === undefined || span.dur_ms > existing.dur_ms) spans[name] = span;
  };

  return {
    labelRoute: (label) => {
      scheduleFlush();
      route = label;
    },
    timed: async (name, work) => {
      scheduleFlush();
      const start = deps.now();
      inFlight += 1;
      try {
        return await work();
      } finally {
        inFlight -= 1;
        record(name, {
          start_ms: toTenths(start - origin),
          dur_ms: toTenths(deps.now() - start),
        });
      }
    },
  };
}
