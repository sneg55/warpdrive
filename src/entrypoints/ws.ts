import { Client } from "pg";
import { env } from "@/config/env";
import { db } from "@/db/client";
import { createRelay } from "@/server/ws/relay";
import { startWsServer } from "@/server/ws/server";

const listenClient = new Client({ connectionString: env.DATABASE_URL });
await listenClient.connect();
startWsServer(8080, { db, relay: createRelay(listenClient) });
console.warn("ws server listening on :8080");
