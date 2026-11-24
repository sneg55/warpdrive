import { afterEach, describe, expect, it } from "vitest";
import { externalTarget } from "./vitest.globalSetup";

const saved = process.env.WD_TEST_PG_URL;
const savedAppUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (saved === undefined) delete process.env.WD_TEST_PG_URL;
  else process.env.WD_TEST_PG_URL = saved;
  if (savedAppUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedAppUrl;
});

describe("externalTarget", () => {
  it("is absent when no external backend is provided", () => {
    delete process.env.WD_TEST_PG_URL;
    expect(externalTarget()).toBeUndefined();
  });

  it("ignores the app's own DATABASE_URL so a dev shell cannot redirect the harness", () => {
    delete process.env.WD_TEST_PG_URL;
    process.env.DATABASE_URL = "postgres://warpdrive:warpdrive@localhost:5433/warpdrive";
    expect(externalTarget()).toBeUndefined();
  });

  it("is absent when the variable is empty", () => {
    process.env.WD_TEST_PG_URL = "";
    expect(externalTarget()).toBeUndefined();
  });

  it("parses the host, port, credentials and admin database", () => {
    process.env.WD_TEST_PG_URL = "postgres://warpdrive:warpdrive@postgres:5432/warpdrive";
    expect(externalTarget()).toEqual({
      host: "postgres",
      port: 5432,
      user: "warpdrive",
      password: "warpdrive",
      adminDatabase: "warpdrive",
    });
  });

  it("defaults the port to 5432 when the url has none", () => {
    process.env.WD_TEST_PG_URL = "postgres://u:p@db.local/db1";
    const target = externalTarget();
    expect(target?.host).toBe("db.local");
    expect(target?.port).toBe(5432);
    expect(target?.adminDatabase).toBe("db1");
  });

  it("decodes url-encoded credentials", () => {
    process.env.WD_TEST_PG_URL = "postgres://u:p%40ss@db.local:5433/db2";
    expect(externalTarget()).toEqual({
      host: "db.local",
      port: 5433,
      user: "u",
      password: "p@ss",
      adminDatabase: "db2",
    });
  });
});
