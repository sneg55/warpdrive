import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  buildEmail,
  type FakeSendBehavior,
  forkSingleEmail,
  json,
  readBody,
  refuseSend,
} from "./agenticFakeEmails";
import type { AgenticSendBody, ChangeEmail } from "./agenticSchemas";

export type { FakeSendBehavior } from "./agenticFakeEmails";

export type FakeAuthMode = "ok" | "redirect" | "forbidden";

export interface FakeAgenticServer {
  url: string;
  mailbox: string;
  seedEmail(email: Partial<ChangeEmail> & { id: string }): ChangeEmail;
  setNextSend(behavior: FakeSendBehavior): void;
  setAuthMode(mode: FakeAuthMode): void;
  setCapabilities(body: unknown): void;
  setMailboxExists(exists: boolean): void;
  setChangesBody(body: unknown): void;
  setAttachment(emailId: string, attachmentId: string, bytes: Uint8Array): void;
  setSingleEmailBody(id: string, body: unknown): void;
  deliveries(clientRef: string): number;
  totalDeliveries(): number;
  sendBodies(): AgenticSendBody[];
  requestHeaders(): Record<string, string | string[] | undefined>[];
  close(): Promise<void>;
}

interface SentRecord {
  id: string;
  thread_id: string;
  message_id: string;
}

export async function startFakeAgenticServer(
  opts: { mailbox?: string } = {},
): Promise<FakeAgenticServer> {
  const mailbox = opts.mailbox ?? "me@example.com";
  const prefix = `/api/v1/mailboxes/${encodeURIComponent(mailbox)}`;
  const emails: ChangeEmail[] = [];
  const attachments = new Map<string, Uint8Array>();
  const singleOverrides = new Map<string, unknown>();
  const sentByRef = new Map<string, SentRecord>();
  const counts = new Map<string, number>();
  const bodies: AgenticSendBody[] = [];
  const headersSeen: Record<string, string | string[] | undefined>[] = [];
  let total = 0;
  let nextSend: FakeSendBehavior = { kind: "ok" };
  let authMode: FakeAuthMode = "ok";
  let capabilities: unknown = { warpdrive: 1 };
  let mailboxExists = true;
  let changesOverride: unknown;

  const maxSeq = () => emails.reduce((m, e) => Math.max(m, e.seq), 0);

  function deliver(body: AgenticSendBody): SentRecord {
    const n = total + 1;
    const rec = {
      id: `sent-${n}`,
      thread_id: body.thread_id ?? `thread-sent-${n}`,
      message_id: `sent-${n}@fake`,
    };
    total = n;
    if (body.client_ref !== undefined) {
      counts.set(body.client_ref, (counts.get(body.client_ref) ?? 0) + 1);
      sentByRef.set(body.client_ref, rec);
    }
    return rec;
  }

  async function handleSend(req: IncomingMessage, res: ServerResponse) {
    let body: AgenticSendBody;
    try {
      body = JSON.parse(await readBody(req)) as AgenticSendBody;
    } catch {
      return json(res, 400, { error: "invalid json" });
    }
    bodies.push(body);
    const prior = body.client_ref === undefined ? undefined : sentByRef.get(body.client_ref);
    if (prior) return json(res, 200, prior);
    const b = nextSend;
    nextSend = { kind: "ok" };
    if (b.kind === "ok") return json(res, 200, deliver(body));
    return refuseSend(res, b);
  }

  function routeEmails(path: string, _req: IncomingMessage, res: ServerResponse) {
    const att = path.match(/^.*\/emails\/([^/]+)\/attachments\/([^/]+)$/);
    if (att && path.startsWith(prefix)) {
      const key = `${decodeURIComponent(att[1] ?? "")}/${decodeURIComponent(att[2] ?? "")}`;
      const bytes = attachments.get(key);
      if (!bytes) return json(res, 404, { error: "not found" });
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      return res.end(Buffer.from(bytes));
    }
    const one = path.match(/^.*\/emails\/([^/]+)$/);
    if (one && path.startsWith(prefix)) {
      const id = decodeURIComponent(one[1] ?? "");
      if (singleOverrides.has(id)) return json(res, 200, singleOverrides.get(id));
      const found = emails.find((e) => e.id === id);
      return found
        ? json(res, 200, forkSingleEmail(found))
        : json(res, 404, { error: "not found" });
    }
    return json(res, 404, { error: "not found" });
  }

  function route(req: IncomingMessage, res: ServerResponse) {
    headersSeen.push(req.headers);
    if (authMode === "redirect") {
      res.writeHead(302, { Location: "https://access.example/login" });
      return res.end();
    }
    if (authMode === "forbidden") return json(res, 403, { error: "forbidden" });
    const url = new URL(req.url ?? "/", "http://fake");
    const path = url.pathname;
    if (path === "/api/v1/capabilities") return json(res, 200, capabilities);
    if (!mailboxExists && path.startsWith(prefix)) return json(res, 404, { error: "not found" });
    if (path === prefix) return json(res, 200, { id: mailbox, email: mailbox });
    if (path === `${prefix}/changes/head`) return json(res, 200, { cursor: maxSeq() });
    if (path === `${prefix}/changes`) {
      if (changesOverride !== undefined) return json(res, 200, changesOverride);
      const after = Number(url.searchParams.get("after") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 100);
      const page = emails.filter((e) => e.seq > after).slice(0, limit);
      return json(res, 200, { emails: page, cursor: page.at(-1)?.seq ?? after });
    }
    if (path === `${prefix}/emails` && req.method === "POST") {
      void handleSend(req, res);
      return;
    }
    return routeEmails(path, req, res);
  }

  const server: Server = createServer(route);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}`,
    mailbox,
    seedEmail(partial) {
      const email = buildEmail(maxSeq() + 1, partial);
      emails.push(email);
      return email;
    },
    setNextSend: (b) => {
      nextSend = b;
    },
    setAuthMode: (m) => {
      authMode = m;
    },
    setCapabilities: (b) => {
      capabilities = b;
    },
    setMailboxExists: (e) => {
      mailboxExists = e;
    },
    setChangesBody: (b) => {
      changesOverride = b;
    },
    setAttachment: (emailId, attachmentId, bytes) => {
      attachments.set(`${emailId}/${attachmentId}`, bytes);
    },
    setSingleEmailBody: (id, body) => {
      singleOverrides.set(id, body);
    },
    deliveries: (ref) => counts.get(ref) ?? 0,
    totalDeliveries: () => total,
    sendBodies: () => bodies,
    requestHeaders: () => headersSeen,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
