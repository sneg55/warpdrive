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

function rawToUtf8(raw: RawData): string {
  if (Buffer.isBuffer(raw)) return raw.toString("utf8");
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf8");
  return Buffer.concat(raw).toString("utf8");
}

export function startWsServer(port: number, deps: WsServerDeps): WebSocketServer {
  const presenceHub = new PresenceHub();
  const maxConnections = deps.maxConnections ?? WS_MAX_CONNECTIONS;

  const wss = new WebSocketServer({
    port,
    maxPayload: deps.maxPayloadBytes ?? WS_MAX_PAYLOAD_BYTES,
  });

  wss.on("connection", (socket: WebSocket) => {
    socket.on("error", (err) => {
      console.warn("ws socket error; closing", err);
    });

    if (wss.clients.size > maxConnections) {
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
