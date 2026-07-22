import { capture, currentRoute } from "./capture";
import { EVENTS } from "./events";

export type Reporter = (errorId?: string) => void;

// Wrap an ActionError reporter so every surfaced Result failure is also a telemetry event.
// This is where warpdrive's real failures live, since operational failures are values, not throws.
export function withActionTelemetry(report: Reporter, surface: "app" | "deal"): Reporter {
  return (errorId) => {
    capture(EVENTS.actionFailed, { errorId: errorId ?? "", surface, route: currentRoute() });
    report(errorId);
  };
}
