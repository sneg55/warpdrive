import { GetBucketLocationCommand, S3Client } from "@aws-sdk/client-s3";

export const DISCOVERY_SIGNING_REGION = "us-east-1";

const LEGACY_LOCATION_REGIONS: Readonly<Record<string, string>> = { EU: "eu-west-1" };

export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

function regionNamedBy(cause: unknown): string | undefined {
  if (typeof cause !== "object" || cause === null || !("Region" in cause)) return undefined;
  const { Region: region } = cause;
  return typeof region === "string" && region.length > 0 ? region : undefined;
}

export async function discoverBucketRegion(
  endpoint: string,
  bucket: string,
  credentials: S3Credentials,
  signal: AbortSignal,
): Promise<string> {
  const probe = new S3Client({
    endpoint,
    region: DISCOVERY_SIGNING_REGION,
    forcePathStyle: true,
    credentials,
  });
  try {
    const out = await probe.send(new GetBucketLocationCommand({ Bucket: bucket }), {
      abortSignal: signal,
    });
    const location: string = out.LocationConstraint ?? "";
    if (location.length === 0) return DISCOVERY_SIGNING_REGION;
    return LEGACY_LOCATION_REGIONS[location] ?? location;
  } catch (cause) {
    const named = regionNamedBy(cause);
    if (named !== undefined) return named;
    throw cause;
  } finally {
    probe.destroy();
  }
}

export function memoizedRegionProvider(discover: () => Promise<string>): () => Promise<string> {
  let pending: Promise<string> | undefined;
  return () => {
    pending ??= discover().catch((cause: unknown) => {
      pending = undefined;
      throw cause;
    });
    return pending;
  };
}
