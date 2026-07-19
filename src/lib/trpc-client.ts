import { createTRPCReact } from "@trpc/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/root";

export const trpc = createTRPCReact<AppRouter>();

// Inferred procedure output types, e.g. RouterOutputs["email"]["thread"]["get"]. Lets an RSC
// prefetch and its client consumer share one exact shape without hand-writing the type.
export type RouterOutputs = inferRouterOutputs<AppRouter>;
