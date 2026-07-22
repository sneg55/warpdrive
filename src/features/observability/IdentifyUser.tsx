"use client";
import { useEffect } from "react";
import { identifyUser, resetIdentity } from "./capture";

export interface TelemetryUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

// Sets the PostHog person once an authenticated actor exists. Mounted in the (app) layout (which
// has the actor) rather than in TelemetryProvider (which lives in the root layout and runs before
// auth). Renders nothing. Resets identity on unmount so a sign-out does not leave the prior person
// attached to a later anonymous session.
export function IdentifyUser({ user }: { user: TelemetryUser }): null {
  const { id, name, email, role } = user;
  useEffect(() => {
    identifyUser({ id, name, email, role });
    return () => resetIdentity();
  }, [id, name, email, role]);
  return null;
}
