// Test-only env defaults so src/config/env.ts can import during unit tests.
// Integration tests override DATABASE_URL with the Testcontainers URL.
// @ts-expect-error: NODE_ENV is typed readonly in NodeJS.ProcessEnv but is writable at runtime.
process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgres://placeholder:placeholder@localhost:5432/placeholder";
process.env.GOOGLE_OAUTH_CLIENT_ID ??= "test-client-id";
process.env.GOOGLE_OAUTH_CLIENT_SECRET ??= "test-client-secret";
process.env.GOOGLE_WORKSPACE_DOMAIN ??= "example.com";
// Use = (not ??=) because Vite/Vitest injects its own BASE_URL="/" into the worker env
// before setupFiles run, which would make ??= a no-op. Our app BASE_URL must win.
process.env.BASE_URL = process.env.BASE_URL?.startsWith("http")
  ? process.env.BASE_URL
  : "https://app.example.com";
process.env.WS_TICKET_SECRET ??= "test-ws-ticket-secret-at-least-32-bytes-long!!";
process.env.WS_PUBLIC_URL ??= "wss://app.example.com/ws";
process.env.MINIO_ENDPOINT ??= "http://minio:9000";
process.env.MINIO_ACCESS_KEY ??= "test-access";
process.env.MINIO_SECRET_KEY ??= "test-secret";
process.env.MINIO_BUCKET ??= "warpdrive";
process.env.TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 1).toString("base64");
process.env.OAUTH_SIGNING_KEY ??= Buffer.alloc(32, 2).toString("base64");
process.env.MCP_ENABLED ??= "true";
process.env.BASE_CURRENCY ??= "USD";
process.env.SEED_ADMIN_EMAIL ??= "admin@example.com";
process.env.ALLOW_FIRST_LOGIN_ADMIN ??= "false";

// Radix UI primitives (DropdownMenu, Dialog, Select) call these DOM APIs that jsdom does not
// implement. Without them, opening a Radix menu/dialog throws under the jsdom test environment.
// Guarded so the node-environment lanes (where Element is undefined) are unaffected. The proto is
// cast to an index type because TS declares these methods non-nullable, but jsdom omits them at
// runtime, so the `??=` fallbacks are genuinely reachable.
if (typeof Element !== "undefined") {
  const proto = Element.prototype as unknown as Record<string, (() => unknown) | undefined>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
}

// Radix Checkbox nested inside a <form> renders a hidden bubble <input> that it measures with
// ResizeObserver, which jsdom does not implement. Stub it so form-nested Checkbox/Switch/Radio
// tests do not throw under the jsdom environment.
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
