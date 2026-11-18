import { z } from "zod";

export const idTokenClaimsSchema = z.object({
  email: z.string().email(),
  email_verified: z.boolean(),
  hd: z.string().optional(),
  sub: z.string().min(1),
  name: z.string().default(""),
  picture: z.string().url().optional(),
  nonce: z.string().optional(),
  aud: z.string(),
  iss: z.string(),
});
