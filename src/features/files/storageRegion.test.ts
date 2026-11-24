import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { StorageClient } from "./storage";
import { memoizedRegionProvider } from "./storageRegion";

const BUCKET = "warpdrive";

const MINIO_LOCATION_XML =
  '<?xml version="1.0" encoding="UTF-8"?>\n<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/"></LocationConstraint>';

function garageWrongRegionXml(region: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Error><Code>AuthorizationHeaderMalformed</Code><Message>Authorization header malformed, unexpected scope</Message><Resource>/${BUCKET}</Resource><Region>${region}</Region></Error>`;
}

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

const servers: Server[] = [];

async function fakeStore(handler: Handler): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

function minioLike(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", "http://store");
  if (req.method === "GET" && url.pathname === `/${BUCKET}/` && url.searchParams.has("location")) {
    res.writeHead(200, { "content-type": "application/xml" }).end(MINIO_LOCATION_XML);
    return;
  }
  if (req.method === "HEAD" && url.pathname === `/${BUCKET}/avatars/someone`) {
    res.writeHead(200, { "content-length": "4", etag: '"abc"', "content-type": "image/png" }).end();
    return;
  }
  res.writeHead(404).end();
}

function garageLike(region: string): Handler {
  return (req, res) => {
    const auth = req.headers.authorization ?? "";
    if (!auth.includes(`/${region}/s3/aws4_request`)) {
      res.writeHead(400, { "content-type": "application/xml" }).end(garageWrongRegionXml(region));
      return;
    }
    res.writeHead(404).end();
  };
}

async function clientWithoutRegion(serverEndpoint: string): Promise<StorageClient> {
  vi.stubEnv("S3_REGION", "");
  vi.stubEnv("S3_BUCKET", BUCKET);
  vi.stubEnv("S3_ENDPOINT", "http://browser.example.com:9000");
  vi.stubEnv("S3_SERVER_ENDPOINT", serverEndpoint);
  vi.stubEnv("AWS_REGION", undefined);
  vi.stubEnv("AWS_DEFAULT_REGION", undefined);
  vi.stubEnv("AWS_PROFILE", undefined);
  vi.stubEnv("AWS_CONFIG_FILE", "/nonexistent/aws-config");
  vi.stubEnv("AWS_SHARED_CREDENTIALS_FILE", "/nonexistent/aws-credentials");
  vi.resetModules();
  const { makeStorageClient } = await import("./storage");
  return makeStorageClient();
}

function credentialRegion(url: string): string | undefined {
  const credential = new URL(url).searchParams.get("X-Amz-Credential") ?? "";
  return credential.split("/")[2];
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
  );
});

describe("storage with S3_REGION unset", () => {
  test("server-side object checks succeed against a MinIO that reports no bucket location", async () => {
    const storage = await clientWithoutRegion(await fakeStore(minioLike));
    const result = await storage.headObject("avatars/someone", AbortSignal.timeout(5_000));
    expect(result.ok ? result.value.contentType : result.error.context).toBe("image/png");
  });

  test("presigns as us-east-1 when the bucket location is empty", async () => {
    const storage = await clientWithoutRegion(await fakeStore(minioLike));
    const result = await storage.presignGet("files/abc", "r.pdf", AbortSignal.timeout(5_000));
    expect(result.ok ? credentialRegion(result.value) : result.error.context).toBe("us-east-1");
  });

  test("presigns as eu-west-1 when the bucket reports the legacy EU location", async () => {
    const storage = await clientWithoutRegion(
      await fakeStore((_req, res) => {
        res
          .writeHead(200, { "content-type": "application/xml" })
          .end(MINIO_LOCATION_XML.replace("></LocationConstraint>", ">EU</LocationConstraint>"));
      }),
    );
    const result = await storage.presignGet("files/abc", "r.pdf", AbortSignal.timeout(5_000));
    expect(result.ok ? credentialRegion(result.value) : result.error.context).toBe("eu-west-1");
  });

  test("presigns with the region a Garage names when it rejects the probe's scope", async () => {
    const storage = await clientWithoutRegion(await fakeStore(garageLike("garage")));
    const result = await storage.presignGet("files/abc", "r.pdf", AbortSignal.timeout(5_000));
    expect(result.ok ? credentialRegion(result.value) : result.error.context).toBe("garage");
  });
});

describe("memoizedRegionProvider", () => {
  test("discovers once and reuses the region", async () => {
    let calls = 0;
    const provider = memoizedRegionProvider(() => {
      calls += 1;
      return Promise.resolve("eu-west-3");
    });
    expect(await provider()).toBe("eu-west-3");
    expect(await provider()).toBe("eu-west-3");
    expect(calls).toBe(1);
  });

  test("retries discovery after a failure instead of caching it", async () => {
    let calls = 0;
    const provider = memoizedRegionProvider(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(new TypeError("down")) : Promise.resolve("garage");
    });
    await expect(provider()).rejects.toThrow("down");
    expect(await provider()).toBe("garage");
  });
});
