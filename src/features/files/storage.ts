import * as Minio from "minio";
import { env } from "@/config/env";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";

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

function buildS3Client(): Minio.Client {
  const parsed = new URL(env.S3_ENDPOINT);
  const useSSL = parsed.protocol === "https:";
  const port = parsed.port.length > 0 ? Number(parsed.port) : useSSL ? 443 : 80;
  return new Minio.Client({
    endPoint: parsed.hostname,
    port,
    useSSL,
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
    region: env.S3_REGION,
  });
}

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

class S3StorageClient implements StorageClient {
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
      policy.setBucket(env.S3_BUCKET);
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
      const stat = await this.client.statObject(env.S3_BUCKET, key);
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
      const url = await this.client.presignedGetObject(env.S3_BUCKET, key, PRESIGN_TTL_SECONDS, {
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
      await this.client.copyObject(
        env.S3_BUCKET,
        destKey,
        `/${env.S3_BUCKET}/${sourceKey}`,
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
      await this.client.removeObject(env.S3_BUCKET, key);
      signal.throwIfAborted();
      return ok(undefined);
    } catch (cause) {
      return err(storageErr(cause, "delete object failed", { key }));
    }
  }

  async getObjectBytes(key: string, signal: AbortSignal): Promise<Result<Buffer, AppError>> {
    signal.throwIfAborted();
    try {
      const stream = await this.client.getObject(env.S3_BUCKET, key);
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
  return new S3StorageClient(buildS3Client());
}
