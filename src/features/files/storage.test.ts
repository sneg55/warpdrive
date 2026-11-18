import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, test } from "vitest";
import { env } from "@/config/env";
import {
  buildS3Client,
  makeStorageClient,
  resolveStorageEndpoints,
  type StorageEndpoints,
} from "./storage";

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${addr.port}`);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
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

// S3_ENDPOINT is baked into the URLs handed to the browser, so in a local dev stack it points at
// a HOST-published port (http://localhost:9000) that the containers cannot dial back. Server-side
// ops (HEAD at upload-confirm, the immutable copy, deletes, attachment reads) must therefore be
// able to follow a separate, container-network endpoint (S3_SERVER_ENDPOINT) while presigned URLs
// keep the browser-facing one, or the very first import/avatar confirm fails with an opaque
// connect error after a successful browser upload.
describe("storage endpoint split", () => {
  test("resolveStorageEndpoints falls back to the browser endpoint when no server one is set", () => {
    expect(resolveStorageEndpoints("http://localhost:9000", undefined)).toEqual({
      presign: "http://localhost:9000",
      ops: "http://localhost:9000",
    });
  });

  test("resolveStorageEndpoints treats an empty server endpoint as unset", () => {
    expect(resolveStorageEndpoints("http://localhost:9000", "")).toEqual({
      presign: "http://localhost:9000",
      ops: "http://localhost:9000",
    });
  });

  test("resolveStorageEndpoints overrides only the ops endpoint", () => {
    expect(resolveStorageEndpoints("http://localhost:9000", "http://garage:3900")).toEqual({
      presign: "http://localhost:9000",
      ops: "http://garage:3900",
    });
  });

  test("buildS3Client dials the URL it is given", () => {
    // host/port/protocol are protected in minio's types but present at runtime; read them via a
    // structural cast so the test asserts what actually gets dialed without reaching the network.
    const client = buildS3Client("http://garage:3900") as unknown as {
      host: string;
      port: number;
      protocol: string;
    };
    expect(client.host).toBe("garage");
    expect(client.port).toBe(3900);
    expect(client.protocol).toBe("http:");
  });

  test("headObject hits the ops endpoint, never the browser one", async () => {
    const stub = createServer((_req, res) => {
      res.writeHead(200, { "content-length": "42", etag: '"deadbeef"' });
      res.end();
    });
    const opsUrl = await listen(stub);
    try {
      const endpoints: StorageEndpoints = {
        // Port 1 on loopback is dead on any sane host: if the ops call used this endpoint the
        // test would fail with a connect error instead of the stub's response.
        presign: "http://127.0.0.1:1",
        ops: opsUrl,
      };
      const head = await makeStorageClient(endpoints).headObject("k", AbortSignal.timeout(2_000));
      expect(head.ok).toBe(true);
      if (head.ok) expect(head.value.size).toBe(42);
    } finally {
      await close(stub);
    }
  });

  test("presigned URLs stay on the browser-facing endpoint when the split is configured", async () => {
    const endpoints: StorageEndpoints = { presign: "http://localhost:9000", ops: "http://garage:3900" };
    const result = await makeStorageClient(endpoints).presignGet(
      "files/abc",
      "report.pdf",
      AbortSignal.timeout(2_000),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new URL(result.value).host).toBe("localhost:9000");
  });
});
