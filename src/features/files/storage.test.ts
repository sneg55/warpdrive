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
    const cause = String(result.error.context?.cause ?? "");
    expect(cause).toContain("127.0.0.1:1");
    expect(cause).not.toContain("browser.example.com");
  });
});
