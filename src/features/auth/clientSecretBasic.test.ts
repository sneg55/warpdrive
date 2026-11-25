import { describe, expect, test } from "vitest";
import { clientSecretBasicHeader, formUrlEncode } from "./clientSecretBasic";

function decode(header: string): string {
  return Buffer.from(header.replace(/^Basic /, ""), "base64").toString("utf8");
}

describe("formUrlEncode", () => {
  test("leaves unreserved characters alone", () => {
    expect(formUrlEncode("AZaz09*-._")).toBe("AZaz09*-._");
  });

  test("encodes a space as a plus and the other reserved characters as percent escapes", () => {
    expect(formUrlEncode("a b")).toBe("a+b");
    expect(formUrlEncode(":/@&=+%")).toBe("%3A%2F%40%26%3D%2B%25");
  });

  test("encodes the characters encodeURIComponent would leave bare", () => {
    expect(formUrlEncode("!'()~")).toBe("%21%27%28%29%7E");
  });

  test("encodes non-ascii as utf-8 percent escapes", () => {
    expect(formUrlEncode("é")).toBe("%C3%A9");
  });
});

describe("clientSecretBasicHeader", () => {
  test("joins the encoded id and secret with a single colon", () => {
    expect(decode(clientSecretBasicHeader("id:1", "se:cret"))).toBe("id%3A1:se%3Acret");
  });

  test("a server that splits on the first colon and form-decodes recovers both values", () => {
    const [id = "", secret = ""] = decode(clientSecretBasicHeader("a:b c", "p@ss:w/rd+&=%é")).split(
      ":",
    );
    expect(new URLSearchParams(`v=${id}`).get("v")).toBe("a:b c");
    expect(new URLSearchParams(`v=${secret}`).get("v")).toBe("p@ss:w/rd+&=%é");
  });
});
