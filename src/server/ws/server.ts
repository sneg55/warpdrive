import type { RawData } from "ws";
import { type WebSocket, WebSocketServer } from "ws";
import {
  WS_CAPACITY_CLOSE_GRACE_MS,
  WS_CLOSE_AT_CAPACITY,
  WS_MAX_CONNECTIONS,
  WS_MAX_PAYLOAD_BYTES,
} from "@/constants/wsLimits";
import { PresenceHub } from "./presenceHub";
import { SocketSession, type WsServerDeps } from "./socketSession";

export type { WsServerDeps } from "./socketSession";

// Decode ws RawData (Buffer | ArrayBuffer | Buffer[]) to a UTF-8 string.
function rawToUtf8(raw: RawData): string {
  if (Buffer.isBuffer(raw)) return raw.toString("utf8");
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf8");
  return Buffer.concat(raw).toString("utf8");
}

// Boots the standalone WS process (Compose `ws` service). Auth via the first `auth`
// frame (ops spec A1); subscribes authorized per A2; server-trusted NOTIFY relayed
// per A3. Deps (db + relay) are injected so tests run against a real Postgres
// container without mocking the database.
//
// This listener is publicly reachable: Caddy proxies /_ws straight through, and a TCP connection
// is accepted from anyone before any credential is presented. The two bounds applied here, plus
// the per-socket auth deadline in SocketSession, are what keep that from being free to abuse.
export function startWsServer(port: number, deps: WsServerDeps): WebSocketServer {
  // One PresenceHub per server instance keeps test runs isolated.
  const presenceHub = new PresenceHub();
  const maxConnections = deps.maxConnections ?? WS_MAX_CONNECTIONS;

  // maxPayload is enforced by `ws` itself during frame reassembly: an oversize frame is rejected
  // and the socket closed with 1009 before any of our code sees the bytes. That is the point,
  // since the library default is 100 MB buffered on behalf of a peer that has not authenticated.
  const wss = new WebSocketServer({
    port,
    maxPayload: deps.maxPayloadBytes ?? WS_MAX_PAYLOAD_BYTES,
  });

  wss.on("connection", (socket: WebSocket) => {
    // Installed BEFORE any branch, including the capacity rejection below. A ws socket with no
    // 'error' listener rethrows, and in this standalone process that is an uncaught exception that
    // takes the whole listener down. Enforcing maxPayload is exactly what makes such an error
    // reachable on demand by any unauthenticated peer (WS_ERR_UNSUPPORTED_MESSAGE_LENGTH). The
    // rejected-at-capacity socket is still live during its close handshake and can be pushed an
    // oversize frame in that window, so the handler must already be attached on that path too.
    socket.on("error", (err) => {
      console.warn("ws socket error; closing", err);
    });

    // `clients` already includes this socket, hence a strict "greater than".
    if (wss.clients.size > maxConnections) {
      // 1013 = "try again later", so a cooperating client backs off instead of reconnecting in a
      // tight loop. But close() only sends the frame and waits for the peer's close-ack: a peer
      // that never acks keeps its file descriptor and its slot in wss.clients, so an attacker
      // could hold the connection count past the ceiling and the cap would not actually bound
      // anything. The grace terminate frees the descriptor regardless of the peer's cooperation.
      // (A pre-accept hard ceiling would mean rejecting at the HTTP upgrade; that is a larger
      // change this deliberately does not make, so a brief post-accept window remains.)
      socket.close(WS_CLOSE_AT_CAPACITY);
      const forceClose = setTimeout(() => socket.terminate(), WS_CAPACITY_CLOSE_GRACE_MS);
      forceClose.unref();
      socket.once("close", () => clearTimeout(forceClose));
      return;
    }

    const session = new SocketSession(socket, deps, presenceHub);
    socket.on("message", (raw) => {
      void session.dispatch(rawToUtf8(raw));
    });
    socket.on("close", () => {
      void session.teardown();
    });
  });
  return wss;
}
