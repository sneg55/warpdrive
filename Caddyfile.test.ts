import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const text = readFileSync("Caddyfile", "utf8");

function vhost(marker: string): string {
  const start = text.indexOf(marker);
  expect(start, `vhost ${marker} not found`).toBeGreaterThanOrEqual(0);
  const next = text.indexOf("\n}", start);
  return text.slice(start, next === -1 ? undefined : next);
}

describe("Caddyfile app vhost", () => {
  const app = vhost("{$APP_DOMAIN} {");

  test("sets HSTS with a one-year max-age", () => {
    expect(app).toMatch(/Strict-Transport-Security "max-age=31536000/);
  });

  test("caps the request body so an unauthenticated flood cannot buffer unbounded bytes", () => {
    expect(app).toMatch(/max_size\s+80MB/);
  });
});

describe("Caddyfile storage vhost", () => {
  const s3 = vhost("s3.{$APP_DOMAIN} {");

  test("stops MIME sniffing on user-uploaded objects", () => {
    expect(s3).toMatch(/X-Content-Type-Options "nosniff"/);
  });

  test("neutralizes any stored HTML object via a CSP sandbox", () => {
    expect(s3).toMatch(/Content-Security-Policy "sandbox/);
  });

  test("sets HSTS on the storage host too", () => {
    expect(s3).toMatch(/Strict-Transport-Security "max-age=31536000/);
  });

  test("proxies to the Garage S3 API port of the compose garage service", () => {
    expect(s3).toMatch(/reverse_proxy garage:3900\s*$/);
  });
});
