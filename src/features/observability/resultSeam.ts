import { capture, currentRoute } from "./capture";
import { EVENTS } from "./events";

export type Reporter = (errorId?: string) => void;

export function withActionTelemetry(report: Reporter, surface: "app" | "deal"): Reporter {
  return (errorId) => {
    capture(EVENTS.actionFailed, { errorId: errorId ?? "", surface, route: currentRoute() });
    report(errorId);
  };
}
