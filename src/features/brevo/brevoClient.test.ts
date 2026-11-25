import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { makeBrevoClient } from "./brevoClient";

const SIG = (): AbortSignal => new AbortController().signal;

function harness(responses: Array<() => Response>) {
  const urls: string[] = [];
  let i = 0;
  const client = makeBrevoClient({
    apiKey: "k",
    baseUrl: "https://api.brevo.test/v3",
    fetch: (url) => {
      urls.push(String(url));
      const next = responses[Math.min(i, responses.length - 1)];
      i += 1;
      return next === undefined ? Promise.reject(new TypeError("none")) : Promise.resolve(next());
    },
    sleep: () => Promise.resolve(),
    nowMs: () => 0,
    requestsPerSecond: 1000,
  });
  return { client, urls };
}

describe("makeBrevoClient.listCampaigns", () => {
  it("pages the catalog without html content and maps the fields", async () => {
    const h = harness([
      () =>
        Response.json({
          campaigns: [
            {
              id: 9,
              name: "Launch",
              subject: "Hi",
              status: "sent",
              sentDate: "2026-01-01T10:00:00.000+00:00",
            },
          ],
          count: 418,
        }),
    ]);
    const r = await h.client.listCampaigns({ limit: 100, offset: 200 }, SIG());
    expect(h.urls[0]).toBe(
      "https://api.brevo.test/v3/emailCampaigns?limit=100&offset=200&excludeHtmlContent=true",
    );
    expect(r.ok && r.value.count).toBe(418);
    expect(r.ok && r.value.campaigns[0]).toEqual({
      id: 9,
      name: "Launch",
      subject: "Hi",
      status: "sent",
      sentAt: new Date("2026-01-01T10:00:00.000+00:00"),
    });
  });

  it("reports a malformed catalog as E_BREVO_004", async () => {
    const h = harness([() => Response.json({ campaigns: [{ id: "x" }] })]);
    const r = await h.client.listCampaigns({ limit: 100, offset: 0 }, SIG());
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.BREVO_PARSE_FAILED);
  });
});

describe("makeBrevoClient.campaignStats", () => {
  it("requests the window for the encoded email", async () => {
    const h = harness([() => Response.json({})]);
    const r = await h.client.campaignStats(
      "pat+tag@example.com",
      { startDate: "2026-01-01", endDate: "2026-03-31" },
      SIG(),
    );
    expect(h.urls[0]).toBe(
      "https://api.brevo.test/v3/contacts/pat%2Btag%40example.com/campaignStats?startDate=2026-01-01&endDate=2026-03-31",
    );
    expect(r.ok && r.value.found).toBe(true);
  });

  it("returns found false for a document_not_found 404", async () => {
    const h = harness([() => Response.json({ code: "document_not_found" }, { status: 404 })]);
    const r = await h.client.campaignStats(
      "x@example.com",
      { startDate: "2026-01-01", endDate: "2026-01-02" },
      SIG(),
    );
    expect(r).toEqual({ ok: true, value: { found: false } });
  });

  it("reports a malformed body as E_BREVO_004", async () => {
    const h = harness([() => Response.json({ delivered: [{ eventTime: "x" }] })]);
    const r = await h.client.campaignStats(
      "x@example.com",
      { startDate: "2026-01-01", endDate: "2026-01-02" },
      SIG(),
    );
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.BREVO_PARSE_FAILED);
  });
});
