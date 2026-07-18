import "@testing-library/jest-dom/vitest";

// Radix Dialog (the ShotFrame lightbox) calls DOM APIs that jsdom does not implement. Without these
// stubs, opening the dialog under jsdom throws. Mirrors the app's test setup.
if (typeof Element !== "undefined") {
  const proto = Element.prototype as unknown as Record<string, (() => unknown) | undefined>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
}

if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe(): void {
      /* no-op */
    }
    unobserve(): void {
      /* no-op */
    }
    disconnect(): void {
      /* no-op */
    }
  }
  globalThis.ResizeObserver = ResizeObserverStub;
}
