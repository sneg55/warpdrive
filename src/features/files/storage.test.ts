import { describe, expect, test } from "vitest";
import { env } from "@/config/env";
import { makeStorageClient } from "./storage";

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
