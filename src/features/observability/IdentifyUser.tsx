"use client";
import { useEffect } from "react";
import { identifyUser, resetIdentity } from "./capture";

export interface TelemetryUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function IdentifyUser({ user }: { user: TelemetryUser }): null {
  const { id, name, email, role } = user;
  useEffect(() => {
    identifyUser({ id, name, email, role });
    return () => resetIdentity();
  }, [id, name, email, role]);
  return null;
}
