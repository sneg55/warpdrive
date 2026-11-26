import { appRouter } from "./root";

export function isRegisteredProcedure(path: string): boolean {
  return Object.hasOwn(appRouter._def.procedures, path);
}
