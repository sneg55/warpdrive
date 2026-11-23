import { env } from "@/config/env";

export interface SigninProviders {
  google: boolean;
  oidc: boolean;
}

export function enabledSigninProviders(): SigninProviders {
  return { google: env.googleSigninEnabled, oidc: env.oidcEnabled };
}
