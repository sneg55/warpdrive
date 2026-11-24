import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/config/env";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";
import { discoverBucketRegion, memoizedRegionProvider, type S3Credentials } from "./storageRegion";

const PRESIGN_TTL_SECONDS = 300;

export interface PresignedPost {
  url: string;
  fields: Record<string, string>;
}

export interface ObjectMetadata {
  size: number;
  etag: string;
  contentType: string | undefined;
}

export interface StorageClient {
  presignPost(
    objectKey: string,
    contentType: string,
    signal: AbortSignal,
    maxBytes?: number,
  ): Promise<Result<PresignedPost, AppError>>;
  headObject(key: string, signal: AbortSignal): Promise<Result<ObjectMetadata, AppError>>;
  presignGet(
    key: string,
    displayFilename: string,
    signal: AbortSignal,
  ): Promise<Result<string, AppError>>;
  copyObject(
    sourceKey: string,
    destKey: string,
    signal: AbortSignal,
  ): Promise<Result<void, AppError>>;
  deleteObject(key: string, signal: AbortSignal): Promise<Result<void, AppError>>;
  getObjectBytes(key: string, signal: AbortSignal): Promise<Result<Buffer, AppError>>;
}

const REGION_DISCOVERY_TIMEOUT_MS = 10_000;

function credentials(): S3Credentials {
  const { S3_ACCESS_KEY: accessKeyId, S3_SECRET_KEY: secretAccessKey } = env;
  return { accessKeyId, secretAccessKey };
}

const discoveredRegion = memoizedRegionProvider(() =>
  discoverBucketRegion(
    env.S3_SERVER_ENDPOINT,
    env.S3_BUCKET,
    credentials(),
    AbortSignal.timeout(REGION_DISCOVERY_TIMEOUT_MS),
  ),
);

function buildS3Client(endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: env.S3_REGION ?? discoveredRegion,
    forcePathStyle: true,
    credentials: credentials(),
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

function encodeCopySource(bucket: string, key: string): string {
  return `${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function stripEtagQuotes(etag: string | undefined): string {
  return (etag ?? "").replace(/^"|"$/g, "");
}

function storageErr(
  cause: unknown,
  message: string,
  context: Record<string, unknown>,
): never | AppError {
  if (cause instanceof Error && cause.name === "AbortError") {
    throw cause;
  }
  return new AppError(ERROR_IDS.FILE_METADATA_MISMATCH, message, {
    ...context,
    cause: String(cause),
  });
}

class S3StorageClient implements StorageClient {
  private readonly server: S3Client;
  private readonly browser: S3Client;

  constructor(server: S3Client, browser: S3Client) {
    this.server = server;
    this.browser = browser;
  }

  async presignPost(
    objectKey: string,
    contentType: string,
    signal: AbortSignal,
    maxBytes: number = env.MAX_FILE_BYTES,
  ): Promise<Result<PresignedPost, AppError>> {
    signal.throwIfAborted();
    try {
      const result = await createPresignedPost(this.browser, {
        Bucket: env.S3_BUCKET,
        Key: objectKey,
        Conditions: [
          ["content-length-range", 1, Math.min(maxBytes, env.MAX_FILE_BYTES)],
          ["eq", "$Content-Type", contentType],
        ],
        Fields: { "Content-Type": contentType },
        Expires: PRESIGN_TTL_SECONDS,
      });
      signal.throwIfAborted();
      return ok({ url: result.url, fields: result.fields });
    } catch (cause) {
      return err(storageErr(cause, "presign post failed", { objectKey }));
    }
  }

  async headObject(key: string, signal: AbortSignal): Promise<Result<ObjectMetadata, AppError>> {
    signal.throwIfAborted();
    try {
      const stat = await this.server.send(
        new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
        { abortSignal: signal },
      );
      signal.throwIfAborted();
      return ok({
        size: stat.ContentLength ?? 0,
        etag: stripEtagQuotes(stat.ETag),
        contentType: stat.ContentType,
      });
    } catch (cause) {
      return err(storageErr(cause, "head object failed", { key }));
    }
  }

  async presignGet(
    key: string,
    displayFilename: string,
    signal: AbortSignal,
  ): Promise<Result<string, AppError>> {
    signal.throwIfAborted();
    try {
      const url = await getSignedUrl(
        this.browser,
        new GetObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key,
          ResponseContentDisposition: `attachment; filename="${displayFilename}"`,
        }),
        { expiresIn: PRESIGN_TTL_SECONDS },
      );
      signal.throwIfAborted();
      return ok(url);
    } catch (cause) {
      return err(storageErr(cause, "presign get failed", { key }));
    }
  }

  async copyObject(
    sourceKey: string,
    destKey: string,
    signal: AbortSignal,
  ): Promise<Result<void, AppError>> {
    signal.throwIfAborted();
    try {
      await this.server.send(
        new CopyObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: destKey,
          CopySource: encodeCopySource(env.S3_BUCKET, sourceKey),
        }),
        { abortSignal: signal },
      );
      signal.throwIfAborted();
      return ok(undefined);
    } catch (cause) {
      return err(storageErr(cause, "copy object failed", { sourceKey, destKey }));
    }
  }

  async deleteObject(key: string, signal: AbortSignal): Promise<Result<void, AppError>> {
    signal.throwIfAborted();
    try {
      await this.server.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), {
        abortSignal: signal,
      });
      signal.throwIfAborted();
      return ok(undefined);
    } catch (cause) {
      return err(storageErr(cause, "delete object failed", { key }));
    }
  }

  async getObjectBytes(key: string, signal: AbortSignal): Promise<Result<Buffer, AppError>> {
    signal.throwIfAborted();
    try {
      const response = await this.server.send(
        new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
        { abortSignal: signal },
      );
      signal.throwIfAborted();
      if (response.Body === undefined) {
        return err(new AppError(ERROR_IDS.FILE_METADATA_MISMATCH, "object has no body", { key }));
      }
      const bytes = await response.Body.transformToByteArray();
      return ok(Buffer.from(bytes));
    } catch (cause) {
      return err(storageErr(cause, "get object bytes failed", { key }));
    }
  }
}

export function makeStorageClient(): StorageClient {
  return new S3StorageClient(buildS3Client(env.S3_SERVER_ENDPOINT), buildS3Client(env.S3_ENDPOINT));
}
