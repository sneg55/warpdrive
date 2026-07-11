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

/**
 * In-memory StorageClient test double for Tasks 20/21. Every call is recorded
 * for assertions and returns deterministic values. headObject is served from a
 * settable metadata map so a test can simulate a confirmed upload. The abort
 * contract is mirrored: signal.throwIfAborted() runs on entry like the real
 * client, so tests can assert cancellation behavior without minio.
 */
// Minimal metadata a test stores per object key: size + content-type, the two
// fields confirmUpload compares against the files row. etag defaults to "fake-etag"
// but a test can set a different value to simulate a post-confirm overwrite (F31).
export interface FakeObject {
  size: number;
  contentType: string;
  etag?: string;
}

export class FakeStorageClient implements StorageClient {
  readonly calls: RecordedCall[] = [];
  readonly metadata = new Map<string, ObjectMetadata>();
  // Set by tests after looking up the row's s3Key to simulate the browser POST.
  readonly objectsByKey = new Map<string, FakeObject>();
  // Keys whose object was successfully removed, in delete order. The reaper test
  // asserts against this to confirm the object was deleted before its row.
  readonly deletedKeys: string[] = [];
  // Keys for which deleteObject should return err (per-item isolation test).
  readonly failDeleteKeys = new Set<string>();
  // Raw bytes keyed by s3Key. Set by attachment send tests so getObjectBytes
  // can return controlled content without real storage I/O.
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
    // objectsByKey is the upload-confirm path; metadata is the legacy setter.
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
    // A server-side copy yields an independent object at destKey. It gets its own
    // stable etag so a later overwrite of the source cannot change the confirmed copy.
    this.objectsByKey.set(destKey, { ...obj, etag: `${obj.etag ?? "fake-etag"}-confirmed` });
    // A real copy duplicates the bytes too, so a caller that reads the copied object back
    // (e.g. confirm's image-magic validation) sees the same content.
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
