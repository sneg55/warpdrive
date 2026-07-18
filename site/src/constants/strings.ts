// Slim copy surface for the marketing site: only the app name and the landing strings the
// components read via STRINGS.landing.*. The CRM's full strings tree does not ship here.
import { LANDING_STRINGS } from "./landingStrings";

export const STRINGS = {
  app: { name: "Warpdrive" },
  landing: LANDING_STRINGS,
} as const;
