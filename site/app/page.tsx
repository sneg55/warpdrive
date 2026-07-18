import type { ReactNode } from "react";
import { LandingPage } from "@/features/landing/LandingPage";

// The whole site is a single static page. The GitHub star badge is fetched client-side inside the
// nav (no server here), so this route has no request-time data and prerenders fully.
export default function Page(): ReactNode {
  return <LandingPage />;
}
