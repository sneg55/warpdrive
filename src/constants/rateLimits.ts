const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const RATE_LIMITS = {
  oauthRegister: { limit: 5, windowMs: HOUR },
  oauthToken: { limit: 60, windowMs: MINUTE },
  authStart: { limit: 20, windowMs: MINUTE },
  health: { limit: 60, windowMs: MINUTE },
  emailTracking: { limit: 240, windowMs: MINUTE },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;
