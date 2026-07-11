import { Client } from "pg";
import { env } from "@/config/env";
import { db } from "@/db/client";
import { createRelay } from "@/server/ws/relay";
import { startWsServer } from "@/server/ws/server";

// Bundled entrypoint for the compose `ws` service (esbuild -> dist/ws.js, run with plain
// node). The relay's pg Client is dedicated to LISTEN and is separate from the app pool.
const listenClient = new Client({ connectionString: env.DATABASE_URL });
await listenClient.connect();
startWsServer(8080, { db, relay: createRelay(listenClient) });
console.warn("ws server listening on :8080");
