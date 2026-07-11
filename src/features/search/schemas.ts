import { z } from "zod";

export const searchInput = z.object({ q: z.string().min(1).max(200) });
