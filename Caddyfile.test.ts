import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// Caddy terminates TLS, so it is the layer that knows a response actually went out over HTTPS
// and is therefore the correct place for HSTS (Next cannot tell, and would emit the header on
// plain-http dev too). Everything else about the edge config that has a security consequence is
// pinned here, because a silent edit to this file is invisible to every other test in the repo.
const text = readFileSync("Caddyfile", "utf8");

// The vhost bodies, split so an assertion about the storage host cannot accidentally be
// satisfied by a directive that only exists on the app host.
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
    // Must stay above the 64mb serverActions limit so Next's own check is the binding one
    // for legitimate traffic and this only stops the absurd case.
    expect(app).toMatch(/max_size\s+80MB/);
  });
});

describe("Caddyfile storage vhost", () => {
  const s3 = vhost("s3.{$APP_DOMAIN} {");

  // MinIO serves user-uploaded bytes from a sibling origin of the app. Session cookies are
  // host-only so a stored HTML object cannot read them, but it could still render as a
  // convincing phishing page on a subdomain of the real product. Force it to download rather
  // than render, and refuse to be framed.
  test("stops MIME sniffing on user-uploaded objects", () => {
    expect(s3).toMatch(/X-Content-Type-Options "nosniff"/);
  });

  test("neutralizes any stored HTML object via a CSP sandbox", () => {
    expect(s3).toMatch(/Content-Security-Policy "sandbox/);
  });

  test("sets HSTS on the storage host too", () => {
    expect(s3).toMatch(/Strict-Transport-Security "max-age=31536000/);
  });
});
