import { describe, expect, it } from "vitest";
import { sniffImageType } from "./imageSniff";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const gif87 = Buffer.from([...Buffer.from("GIF87a"), 0, 0]);
const gif89 = Buffer.from([...Buffer.from("GIF89a"), 0, 0]);
const webp = Buffer.from([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]);

describe("sniffImageType", () => {
  it("recognizes real image magic bytes", () => {
    expect(sniffImageType(png)).toBe("image/png");
    expect(sniffImageType(jpeg)).toBe("image/jpeg");
    expect(sniffImageType(gif87)).toBe("image/gif");
    expect(sniffImageType(gif89)).toBe("image/gif");
    expect(sniffImageType(webp)).toBe("image/webp");
  });

  it("returns null for non-image bytes (a PDF labeled as an image slips no further)", () => {
    expect(sniffImageType(Buffer.from("%PDF-1.7\n..."))).toBeNull();
    expect(sniffImageType(Buffer.from("<svg xmlns=..."))).toBeNull();
    expect(sniffImageType(Buffer.from([]))).toBeNull();
    expect(sniffImageType(Buffer.from([0x89, 0x50]))).toBeNull(); // truncated PNG
  });

  it("does not treat a RIFF container that is not WEBP as an image", () => {
    const wav = Buffer.from([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WAVE")]);
    expect(sniffImageType(wav)).toBeNull();
  });
});
