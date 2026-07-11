import { startWorker } from "@/server/worker";

// Bundled entrypoint for the compose `worker` service (esbuild -> dist/worker.js, run
// with plain node). Boots pg-boss, publishes the singleton, registers all job handlers.
void startWorker();
