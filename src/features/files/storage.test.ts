import { afterEach, describe, expect, test, vi } from "vitest";
import { env } from "@/config/env";
import { makeStorageClient, type StorageClient } from "./storage";

const BROWSER_ENDPOINT = "http://browser.example.com:9000";
const SERVER_ENDPOINT = "http://127.0.0.1:1";

async function clientWith(vars: Record<string, string>): Promise<StorageClient> {
  for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value);
  vi.resetModules();
  const { makeStorageClient: fresh } = await import("./storage");
  return fresh();
}

function requiresExactly(conditions: unknown[], field: string, value: string): boolean {
  return conditions.some((c) => {
    if (Array.isArray(c)) return c[0] === "eq" && c[1] === "$" + field && c[2] === value;
    return (c as Record<string, unknown>)[field] === value;
  });
}

describe("storage client", () => {
  test("presigns a download for the configured bucket and region without a network round trip", async () => {
    const result = await makeStorageClient().presignGet(
      "files/abc",
      "report.pdf",
      AbortSignal.timeout(2_000),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const url = new URL(result.value);
    expect(url.pathname).toBe(`/${env.S3_BUCKET}/files/abc`);
    expect(url.searchParams.get("X-Amz-Credential")).toMatch(
      new RegExp(`/${env.S3_REGION}/s3/aws4_request$`),
    );
    expect(url.searchParams.get("response-content-disposition")).toBe(
      'attachment; filename="report.pdf"',
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
  });

  test("addresses presigned downloads path-style against the endpoint host", async () => {
    const storage = await clientWith({
      S3_ENDPOINT: BROWSER_ENDPOINT,
      S3_SERVER_ENDPOINT: SERVER_ENDPOINT,
    });
    const result = await storage.presignGet("files/abc", "report.pdf", AbortSignal.timeout(2_000));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const url = new URL(result.value);
    expect(url.host).toBe("browser.example.com:9000");
    expect(url.pathname).toBe(`/${env.S3_BUCKET}/files/abc`);
  });

  test("presigns an upload post for the bucket, key and content type with a size cap", async () => {
    const result = await makeStorageClient().presignPost(
      "imports/batch/file.csv",
      "text/csv",
      AbortSignal.timeout(2_000),
      1_000,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new URL(result.value.url).pathname).toBe(`/${env.S3_BUCKET}`);
    const fields = result.value.fields;
    expect(fields["key"]).toBe("imports/batch/file.csv");
    expect(fields["Content-Type"]).toBe("text/csv");
    expect(fields["x-amz-credential"] ?? fields["X-Amz-Credential"]).toMatch(
      new RegExp(`/${env.S3_REGION}/s3/aws4_request$`),
    );
    const policyField = fields["policy"] ?? fields["Policy"] ?? "";
    const policy = JSON.parse(Buffer.from(policyField, "base64").toString("utf8")) as {
      expiration: string;
      conditions: unknown[];
    };
    expect(policy.conditions).toContainEqual(["content-length-range", 1, 1_000]);
    expect(requiresExactly(policy.conditions, "bucket", env.S3_BUCKET)).toBe(true);
    const secondsLeft = (Date.parse(policy.expiration) - Date.now()) / 1000;
    expect(secondsLeft).toBeGreaterThan(280);
    expect(secondsLeft).toBeLessThanOrEqual(300);
  });
});

describe("endpoint split", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("presigns downloads for the browser-facing S3_ENDPOINT", async () => {
    const storage = await clientWith({
      S3_ENDPOINT: BROWSER_ENDPOINT,
      S3_SERVER_ENDPOINT: SERVER_ENDPOINT,
    });
    const result = await storage.presignGet("files/abc", "report.pdf", AbortSignal.timeout(2_000));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new URL(result.value).host).toBe("browser.example.com:9000");
  });

  test("presigns uploads for the browser-facing S3_ENDPOINT", async () => {
    const storage = await clientWith({
      S3_ENDPOINT: BROWSER_ENDPOINT,
      S3_SERVER_ENDPOINT: SERVER_ENDPOINT,
    });
    const result = await storage.presignPost(
      "imports/batch/file.csv",
      "text/csv",
      AbortSignal.timeout(2_000),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new URL(result.value.url).host).toBe("browser.example.com:9000");
  });

  test("server-side object checks dial S3_SERVER_ENDPOINT, not the browser endpoint", async () => {
    const storage = await clientWith({
      S3_ENDPOINT: BROWSER_ENDPOINT,
      S3_SERVER_ENDPOINT: SERVER_ENDPOINT,
    });
    const result = await storage.headObject("imports/batch/file.csv", AbortSignal.timeout(5_000));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const cause = JSON.stringify(result.error.context ?? {});
    expect(cause).toContain("127.0.0.1:1");
    expect(cause).not.toContain("browser.example.com");
  });
});
