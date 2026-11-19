import { afterEach, describe, expect, it } from "vitest";
import { externalTarget } from "./vitest.globalSetup";

const saved = process.env.DATABASE_URL;

afterEach(() => {
  if (saved === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = saved;
});

describe("externalTarget", () => {
  it("is absent when no external backend is provided", () => {
    delete process.env.DATABASE_URL;
    expect(externalTarget()).toBeUndefined();
  });

  it("is absent when the variable is empty", () => {
    process.env.DATABASE_URL = "";
    expect(externalTarget()).toBeUndefined();
  });

  it("parses the host, port, credentials and admin database", () => {
    process.env.DATABASE_URL = "postgres://warpdrive:warpdrive@postgres:5432/warpdrive";
    expect(externalTarget()).toEqual({
      host: "postgres",
      port: 5432,
      user: "warpdrive",
      password: "warpdrive",
      adminDatabase: "warpdrive",
    });
  });

  it("defaults the port to 5432 when the url has none", () => {
    process.env.DATABASE_URL = "postgres://u:p@db.local/db1";
    const target = externalTarget();
    expect(target?.host).toBe("db.local");
    expect(target?.port).toBe(5432);
    expect(target?.adminDatabase).toBe("db1");
  });

  it("decodes url-encoded credentials", () => {
    process.env.DATABASE_URL = "postgres://u:p%40ss@db.local:5433/db2";
    expect(externalTarget()).toEqual({
      host: "db.local",
      port: 5433,
      user: "u",
      password: "p@ss",
      adminDatabase: "db2",
    });
  });
});
