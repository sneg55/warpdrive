import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "./crypto";

function flipByte(buf: Buffer, index: number): Buffer {
  const copy = Buffer.from(buf);
  copy[index] = (copy[index]! ^ 0xff) & 0xff;
  return copy;
}

const IV_LEN = 12;
const TAG_LEN = 16;

describe("token crypto", () => {
  it("round-trips a refresh token", () => {
    const packed = encryptToken("1//refresh-token-xyz");
    const out = decryptToken(packed);
    expect(out.ok).toBe(true);
    if (out.ok === true) expect(out.value).toBe("1//refresh-token-xyz");
  });

  it("produces a different ciphertext each call (random IV)", () => {
    expect(encryptToken("same").equals(encryptToken("same"))).toBe(false);
  });

  it("returns an error (never throws) on tamper with ciphertext", () => {
    const packed = encryptToken("secret");
    const tampered = flipByte(packed, packed.length - 1);
    const out = decryptToken(tampered);
    expect(out.ok).toBe(false);
    if (out.ok === false) expect(out.error.id).toBe("E_GMAIL_005");
  });

  it("returns an error (never throws) on tamper with the IV", () => {
    const packed = encryptToken("secret");
    const tampered = flipByte(packed, 0);
    const out = decryptToken(tampered);
    expect(out.ok).toBe(false);
    if (out.ok === false) expect(out.error.id).toBe("E_GMAIL_005");
  });

  it("returns an error (never throws) on tamper with the auth tag", () => {
    const packed = encryptToken("secret");
    const tampered = flipByte(packed, IV_LEN);
    const out = decryptToken(tampered);
    expect(out.ok).toBe(false);
    if (out.ok === false) expect(out.error.id).toBe("E_GMAIL_005");
  });

  it("returns an error (never throws) on an empty buffer", () => {
    const out = decryptToken(Buffer.alloc(0));
    expect(out.ok).toBe(false);
    if (out.ok === false) expect(out.error.id).toBe("E_GMAIL_005");
  });

  it("returns an error (never throws) on a sub-28-byte garbage buffer", () => {
    const garbage = Buffer.alloc(IV_LEN + TAG_LEN - 1, 0x42);
    const out = decryptToken(garbage);
    expect(out.ok).toBe(false);
    if (out.ok === false) expect(out.error.id).toBe("E_GMAIL_005");
  });
});
