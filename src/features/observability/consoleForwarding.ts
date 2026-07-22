import { capture, currentRoute } from "./capture";
import { EVENTS } from "./events";

const DEDUPE_CAP = 500;
const MESSAGE_CAP = 500;

export function installConsoleForwarding(): () => void {
  const originalWarn = console.warn;
  const originalError = console.error;
  const seen = new Set<string>();
  let inForward = false; // prevents recursion if capture's fail-open calls console.warn

  function forward(level: "warn" | "error", args: unknown[]): void {
    if (inForward) return;
    const message = args.map(String).join(" ").slice(0, MESSAGE_CAP);
    const key = `${level}:${message}`;
    if (seen.has(key)) return;
    if (seen.size >= DEDUPE_CAP) seen.clear();
    seen.add(key);
    inForward = true;
    try {
      capture(EVENTS.consoleForward, { level, message, route: currentRoute() });
    } finally {
      inForward = false;
    }
  }

  console.warn = (...args: unknown[]) => {
    forward("warn", args);
    originalWarn.call(console, ...args);
  };
  console.error = (...args: unknown[]) => {
    forward("error", args);
    originalError.call(console, ...args);
  };

  return () => {
    console.warn = originalWarn;
    console.error = originalError;
  };
}
