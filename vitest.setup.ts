// @ts-expect-error: NODE_ENV is typed readonly in NodeJS.ProcessEnv but is writable at runtime.
process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgres://placeholder:placeholder@localhost:5432/placeholder";
process.env.GOOGLE_OAUTH_CLIENT_ID ??= "test-client-id";
process.env.GOOGLE_OAUTH_CLIENT_SECRET ??= "test-client-secret";
process.env.GOOGLE_WORKSPACE_DOMAIN ??= "example.com";
process.env.BASE_URL = process.env.BASE_URL?.startsWith("http")
  ? process.env.BASE_URL
  : "https://app.example.com";
process.env.WS_TICKET_SECRET ??= "test-ws-ticket-secret-at-least-32-bytes-long!!";
process.env.WS_PUBLIC_URL ??= "wss://app.example.com/ws";
process.env.S3_ENDPOINT ??= "http://garage:3900";
process.env.S3_ACCESS_KEY ??= "test-access";
process.env.S3_SECRET_KEY ??= "test-secret";
process.env.S3_BUCKET ??= "warpdrive";
process.env.S3_REGION ??= "garage";
process.env.TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 1).toString("base64");
process.env.OAUTH_SIGNING_KEY ??= Buffer.alloc(32, 2).toString("base64");
process.env.MCP_ENABLED ??= "true";
process.env.BASE_CURRENCY ??= "USD";
process.env.SEED_ADMIN_EMAIL ??= "admin@example.com";
process.env.ALLOW_FIRST_LOGIN_ADMIN ??= "false";

if (typeof Element !== "undefined") {
  const { configure } = await import("@testing-library/react");
  configure({ asyncUtilTimeout: 15_000 });

  const proto = Element.prototype as unknown as Record<string, (() => unknown) | undefined>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
}

if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub;
}

export {};
