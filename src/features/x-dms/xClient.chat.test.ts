import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import type { XDmSettings } from "./settings";
import { makeXClient } from "./xClient";

const settings: XDmSettings = {
  clientId: "cid",
  clientSecret: "csecret",
  redirectUri: "https://crm.example.test/api/x/oauth/callback",
};
const signal = new AbortController().signal;

interface Seen {
  url: URL;
  init: RequestInit;
}

function harness(respond: (seen: Seen) => Response) {
  const calls: Seen[] = [];
  const fetchStub = ((input: string | URL | Request, init?: RequestInit) => {
    const seen = { url: new URL(input instanceof Request ? input.url : input), init: init ?? {} };
    calls.push(seen);
    return Promise.resolve(respond(seen));
  }) as typeof fetch;
  const client = makeXClient({
    settings,
    fetch: fetchStub,
    sleep: () => Promise.resolve(),
    nowMs: () => 1_000_000,
  });
  return { client, calls };
}

function bodyJson(seen: Seen | undefined): unknown {
  const b = seen?.init.body;
  return typeof b === "string" ? JSON.parse(b) : null;
}

function thriftEvent(firstFieldId: number, id: string, type = 11): string {
  const head = Buffer.alloc(7);
  head.writeUInt8(type, 0);
  head.writeInt16BE(firstFieldId, 1);
  head.writeInt32BE(id.length, 3);
  return Buffer.concat([head, Buffer.from(id), Buffer.from([0x00, 0x01, 0x02])]).toString("base64");
}

const keyItem = {
  public_key_version: 3,
  public_key: "idpk",
  signing_public_key: "sigpk",
  identity_public_key_signature: "sig",
};

describe("x client getPublicKeys", () => {
  it("parses an array with numeric and string versions and optional juicebox config", async () => {
    const { client, calls } = harness(() =>
      Response.json({
        data: [
          { ...keyItem, juicebox_config: { realms: [1] } },
          { ...keyItem, public_key_version: "4" },
        ],
      }),
    );
    const r = await client.getPublicKeys("at", "42", signal);
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.url.pathname).toBe("/2/users/42/public_keys");
    expect(r).toEqual({
      ok: true,
      value: [
        {
          version: "3",
          identityPublicKey: "idpk",
          signingPublicKey: "sigpk",
          identityPublicKeySignature: "sig",
          juiceboxConfig: { realms: [1] },
        },
        {
          version: "4",
          identityPublicKey: "idpk",
          signingPublicKey: "sigpk",
          identityPublicKeySignature: "sig",
          juiceboxConfig: null,
        },
      ],
    });
  });

  it("maps a missing identity signature to null", async () => {
    const unsigned = { ...keyItem, identity_public_key_signature: undefined };
    const { client } = harness(() => Response.json({ data: [keyItem, unsigned] }));
    const r = await client.getPublicKeys("at", "42", signal);
    expect(r.ok && r.value.map((k) => k.identityPublicKeySignature)).toEqual(["sig", null]);
  });

  it("accepts a single key without an identity signature", async () => {
    const unsigned = { ...keyItem, identity_public_key_signature: undefined };
    const { client } = harness(() => Response.json({ data: unsigned }));
    const r = await client.getPublicKeys("at", "42", signal);
    expect(r.ok && r.value[0]?.identityPublicKeySignature).toBeNull();
  });

  it("accepts a single object", async () => {
    const { client } = harness(() => Response.json({ data: keyItem }));
    const r = await client.getPublicKeys("at", "42", signal);
    expect(r.ok && r.value.length).toBe(1);
  });

  it("fails with a parse error on a malformed body", async () => {
    const { client } = harness(() => Response.json({ data: [{ public_key: 1 }] }));
    const r = await client.getPublicKeys("at", "42", signal);
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.X_PARSE_FAILED);
  });
});

describe("x client listEvents key events", () => {
  const event = {
    id: "e1",
    conversation_id: "10:20",
    sender_id: "20",
    created_at: "2026-11-01T00:00:00.000Z",
    encoded_event: "AAA",
  };

  it("returns conversation_key_events from meta", async () => {
    const { client } = harness(() =>
      Response.json({ data: [event], meta: { conversation_key_events: ["a2V5", "a2V5Mg=="] } }),
    );
    const r = await client.listEvents("at", { conversationId: "10:20", maxResults: 5 }, signal);
    expect(r.ok && r.value.keyEvents).toEqual(["a2V5", "a2V5Mg=="]);
  });

  it("returns an empty list when absent", async () => {
    const { client } = harness(() => Response.json({ data: [event], meta: {} }));
    const r = await client.listEvents("at", { conversationId: "10:20", maxResults: 5 }, signal);
    expect(r.ok && r.value.keyEvents).toEqual([]);
  });
});

describe("x client addConversationKeys", () => {
  const body = {
    conversationKeyVersion: "7",
    conversationParticipantKeys: [
      { userId: "1", encryptedConversationKey: "k1", publicKeyVersion: "3" },
    ],
    actionSignatures: [{ signatureVersion: "1", messageSignature: "s" }],
  };

  it("posts a recursively snake_cased body and parses the result", async () => {
    const { client, calls } = harness(() =>
      Response.json({ data: { conversation_id: "10-20", sequence_id: "123" } }),
    );
    const r = await client.addConversationKeys("at", "10:20", body, signal);
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.url.pathname).toBe("/2/chat/conversations/10-20/keys");
    expect(calls[0]?.init.headers).toMatchObject({
      Authorization: "Bearer at",
      "Content-Type": "application/json",
    });
    expect(bodyJson(calls[0])).toEqual({
      conversation_key_version: "7",
      conversation_participant_keys: [
        { user_id: "1", encrypted_conversation_key: "k1", public_key_version: "3" },
      ],
      action_signatures: [{ signature_version: "1", message_signature: "s" }],
    });
    expect(r).toEqual({ ok: true, value: { conversationId: "10-20", sequenceId: "123" } });
  });

  it("maps a 403 to the send-refused id", async () => {
    const { client } = harness(() => new Response("{}", { status: 403 }));
    const r = await client.addConversationKeys("at", "20", body, signal);
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.X_SEND_REFUSED);
  });
});

describe("x client sendChatMessage", () => {
  const body = {
    messageId: "uuid-1",
    encodedMessageCreateEvent: "ev",
    encodedMessageEventSignature: "sg",
    xdkVersion: "1.0",
  };

  it("posts snake_case and returns the first thrift string field as eventId", async () => {
    const { client, calls } = harness(() =>
      Response.json(
        { data: { encoded_message_event: thriftEvent(1, "2122347288638963712") } },
        { status: 201 },
      ),
    );
    const r = await client.sendChatMessage("at", "10:20", body, signal);
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.url.pathname).toBe("/2/chat/conversations/10-20/messages");
    expect(bodyJson(calls[0])).toEqual({
      message_id: "uuid-1",
      encoded_message_create_event: "ev",
      encoded_message_event_signature: "sg",
      xdk_version: "1.0",
    });
    expect(r).toEqual({ ok: true, value: { eventId: "2122347288638963712" } });
  });

  it("maps a 403 to the send-refused id", async () => {
    const { client } = harness(() => new Response("{}", { status: 403 }));
    const r = await client.sendChatMessage("at", "10:20", body, signal);
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.X_SEND_REFUSED);
  });

  it.each([
    ["wrong field id", thriftEvent(2, "123")],
    ["wrong type", thriftEvent(1, "123", 8)],
    ["truncated", Buffer.from([0x0b, 0x00, 0x01, 0x00, 0x00, 0x00, 0x09, 0x31]).toString("base64")],
    ["too short", Buffer.from([0x0b]).toString("base64")],
  ])("returns a parse error for %s", async (_name, encoded) => {
    const { client } = harness(() =>
      Response.json({ data: { encoded_message_event: encoded } }, { status: 201 }),
    );
    const r = await client.sendChatMessage("at", "10:20", body, signal);
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.X_PARSE_FAILED);
  });
});
