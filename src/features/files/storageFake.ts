import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";
import type { ObjectMetadata, PresignedPost, StorageClient } from "./storage";

export interface RecordedCall {
  method:
    | "presignPost"
    | "headObject"
    | "presignGet"
    | "deleteObject"
    | "copyObject"
    | "getObjectBytes";
  args: Record<string, unknown>;
}

export interface FakeObject {
  size: number;
  contentType: string;
  etag?: string;
}

export class FakeStorageClient implements StorageClient {
  readonly calls: RecordedCall[] = [];
  readonly metadata = new Map<string, ObjectMetadata>();
  readonly objectsByKey = new Map<string, FakeObject>();
  readonly deletedKeys: string[] = [];
  readonly failDeleteKeys = new Set<string>();
  readonly objectBytes = new Map<string, Buffer>();

  setMetadata(key: string, meta: ObjectMetadata): void {
    this.metadata.set(key, meta);
  }

  presignPost(
    objectKey: string,
    contentType: string,
    signal: AbortSignal,
    maxBytes?: number,
  ): Promise<Result<PresignedPost, AppError>> {
    signal.throwIfAborted();
    this.calls.push({ method: "presignPost", args: { objectKey, contentType, maxBytes } });
    return Promise.resolve(
      ok({
        url: `https://fake-storage.local/${objectKey}`,
        fields: {
          key: objectKey,
          "Content-Type": contentType,
          policy: "fake-policy",
          "x-amz-signature": "fake-signature",
        },
      }),
    );
  }

  headObject(key: string, signal: AbortSignal): Promise<Result<ObjectMetadata, AppError>> {
    signal.throwIfAborted();
    this.calls.push({ method: "headObject", args: { key } });
    const obj = this.objectsByKey.get(key);
    if (obj !== undefined) {
      return Promise.resolve(
        ok({ size: obj.size, etag: obj.etag ?? "fake-etag", contentType: obj.contentType }),
      );
    }
    const meta = this.metadata.get(key);
    if (meta === undefined) {
      return Promise.resolve(
        err(new AppError(ERROR_IDS.FILE_METADATA_MISMATCH, "object not found", { key })),
      );
    }
    return Promise.resolve(ok(meta));
  }

  presignGet(
    key: string,
    displayFilename: string,
    signal: AbortSignal,
  ): Promise<Result<string, AppError>> {
    signal.throwIfAborted();
    this.calls.push({ method: "presignGet", args: { key, displayFilename } });
    const disposition = encodeURIComponent(`attachment; filename="${displayFilename}"`);
    return Promise.resolve(
      ok(`https://fake-storage.local/${key}?response-content-disposition=${disposition}`),
    );
  }

  copyObject(
    sourceKey: string,
    destKey: string,
    signal: AbortSignal,
  ): Promise<Result<void, AppError>> {
    signal.throwIfAborted();
    this.calls.push({ method: "copyObject", args: { sourceKey, destKey } });
    const obj = this.objectsByKey.get(sourceKey);
    if (obj === undefined) {
      return Promise.resolve(
        err(new AppError(ERROR_IDS.FILE_METADATA_MISMATCH, "copy source missing", { sourceKey })),
      );
    }
    this.objectsByKey.set(destKey, { ...obj, etag: `${obj.etag ?? "fake-etag"}-confirmed` });
    const bytes = this.objectBytes.get(sourceKey);
    if (bytes !== undefined) this.objectBytes.set(destKey, bytes);
    return Promise.resolve(ok(undefined));
  }

  deleteObject(key: string, signal: AbortSignal): Promise<Result<void, AppError>> {
    signal.throwIfAborted();
    this.calls.push({ method: "deleteObject", args: { key } });
    if (this.failDeleteKeys.has(key)) {
      return Promise.resolve(
        err(new AppError(ERROR_IDS.FILE_METADATA_MISMATCH, "delete object failed", { key })),
      );
    }
    this.metadata.delete(key);
    this.objectsByKey.delete(key);
    this.deletedKeys.push(key);
    return Promise.resolve(ok(undefined));
  }

  getObjectBytes(key: string, signal: AbortSignal): Promise<Result<Buffer, AppError>> {
    signal.throwIfAborted();
    this.calls.push({ method: "getObjectBytes", args: { key } });
    const bytes = this.objectBytes.get(key);
    if (bytes === undefined) {
      return Promise.resolve(
        err(
          new AppError(ERROR_IDS.FILE_METADATA_MISMATCH, "object bytes not found in fake", { key }),
        ),
      );
    }
    return Promise.resolve(ok(bytes));
  }
}
