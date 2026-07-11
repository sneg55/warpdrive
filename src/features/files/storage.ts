import * as Minio from "minio";
import { env } from "@/config/env";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";

// Presigned uploads/downloads expire after 5 minutes. Short-lived by design:
// the URL is handed to a browser that uses it immediately.
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

/**
 * Storage boundary. Every method takes a required AbortSignal to match the
 * project convention even though the minio v8 SDK cannot itself be cancelled:
 * we guard with signal.throwIfAborted() before and after each call so an already
 * obsolete request never issues, and a cancelled caller never observes a stale
 * result. Operational failures are returned as Result, not thrown.
 */
export interface StorageClient {
  // maxBytes caps the POST content-length policy. Defaults to env.MAX_FILE_BYTES; callers with a
  // tighter limit (e.g. avatars at 2 MB) pass it so the storage layer, not just a client-side or
  // confirm-time check, rejects oversize uploads.
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
  // Server-side copy. Used at confirm to move a validated object to an immutable key
  // the uploader's presigned POST can never target (F33).
  copyObject(
    sourceKey: string,
    destKey: string,
    signal: AbortSignal,
  ): Promise<Result<void, AppError>>;
  deleteObject(key: string, signal: AbortSignal): Promise<Result<void, AppError>>;
  // Fetch the raw bytes of an object. Used at send-time to inline attachments into
  // the MIME message. Never used for presigned download URLs served to browsers.
  getObjectBytes(key: string, signal: AbortSignal): Promise<Result<Buffer, AppError>>;
}

function buildMinioClient(): Minio.Client {
  const parsed = new URL(env.MINIO_ENDPOINT);
  const useSSL = parsed.protocol === "https:";
  const port = parsed.port.length > 0 ? Number(parsed.port) : useSSL ? 443 : 80;
  return new Minio.Client({
    endPoint: parsed.hostname,
    port,
    useSSL,
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
  });
}

// AbortError must propagate untouched; only operational failures become Result.
function storageErr(
  cause: unknown,
  message: string,
  context: Record<string, unknown>,
): never | AppError {
  if (cause instanceof DOMException && cause.name === "AbortError") {
    throw cause;
  }
  return new AppError(ERROR_IDS.FILE_METADATA_MISMATCH, message, {
    ...context,
    cause: String(cause),
  });
}

class MinioStorageClient implements StorageClient {
  private readonly client: Minio.Client;

  constructor(client: Minio.Client) {
    this.client = client;
  }

  async presignPost(
    objectKey: string,
    contentType: string,
    signal: AbortSignal,
    maxBytes: number = env.MAX_FILE_BYTES,
  ): Promise<Result<PresignedPost, AppError>> {
    signal.throwIfAborted();
    try {
      const policy = this.client.newPostPolicy();
      policy.setBucket(env.MINIO_BUCKET);
      policy.setKey(objectKey);
      policy.setContentLengthRange(1, Math.min(maxBytes, env.MAX_FILE_BYTES));
      policy.setContentType(contentType);
      policy.setExpires(new Date(Date.now() + PRESIGN_TTL_SECONDS * 1000));
      const result = await this.client.presignedPostPolicy(policy);
      signal.throwIfAborted();
      return ok({ url: result.postURL, fields: result.formData });
    } catch (cause) {
      return err(storageErr(cause, "presign post failed", { objectKey }));
    }
  }

  async headObject(key: string, signal: AbortSignal): Promise<Result<ObjectMetadata, AppError>> {
    signal.throwIfAborted();
    try {
      const stat = await this.client.statObject(env.MINIO_BUCKET, key);
      signal.throwIfAborted();
      const metaData = stat.metaData as Record<string, string | undefined>;
      return ok({
        size: stat.size,
        etag: stat.etag,
        contentType: metaData["content-type"],
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
      const url = await this.client.presignedGetObject(env.MINIO_BUCKET, key, PRESIGN_TTL_SECONDS, {
        "response-content-disposition": `attachment; filename="${displayFilename}"`,
      });
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
      // CopyConditions left empty: an unconditional server-side copy within the bucket.
      await this.client.copyObject(
        env.MINIO_BUCKET,
        destKey,
        `/${env.MINIO_BUCKET}/${sourceKey}`,
        new Minio.CopyConditions(),
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
      await this.client.removeObject(env.MINIO_BUCKET, key);
      signal.throwIfAborted();
      return ok(undefined);
    } catch (cause) {
      return err(storageErr(cause, "delete object failed", { key }));
    }
  }

  async getObjectBytes(key: string, signal: AbortSignal): Promise<Result<Buffer, AppError>> {
    signal.throwIfAborted();
    try {
      const stream = await this.client.getObject(env.MINIO_BUCKET, key);
      signal.throwIfAborted();
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", resolve);
        stream.on("error", reject);
      });
      return ok(Buffer.concat(chunks));
    } catch (cause) {
      return err(storageErr(cause, "get object bytes failed", { key }));
    }
  }
}

export function makeStorageClient(): StorageClient {
  return new MinioStorageClient(buildMinioClient());
}
