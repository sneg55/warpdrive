import { z } from "zod";

// Decoded Google ID token claims, validated at the boundary (ops spec E6).
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

export type IdTokenClaims = z.infer<typeof idTokenClaimsSchema>;
