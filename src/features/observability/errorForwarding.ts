import { captureException } from "./capture";

export function forwardBoundaryError(
  error: unknown,
  ctx: { route?: string; digest?: string },
): void {
  captureException(error, { route: ctx.route ?? "", digest: ctx.digest ?? "" });
}

export function installGlobalHandlers(): () => void {
  if (typeof window === "undefined") return () => {};
  const route = (): string => window.location.pathname;
  const onRejection = (e: PromiseRejectionEvent): void => {
    captureException(e.reason, { route: route(), kind: "unhandledrejection" });
  };
  const onError = (e: ErrorEvent): void => {
    captureException(e.error ?? e.message, { route: route(), kind: "window.error" });
  };
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("error", onError);
  return () => {
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("error", onError);
  };
}
