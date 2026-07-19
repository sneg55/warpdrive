import { ImageResponse } from "next/og";
import { LANDING_STRINGS } from "@/constants/landingStrings";
import { STRINGS } from "@/constants/strings";

// Build-time Open Graph / social card (also the Twitter/X and AI-answer-engine card via og:image
// fallback). Rendered once into the static export by next/og, so there is no server. Replaces the
// old 512x512 icon that rendered as a broken square on summary_large_image. Satori supports a subset
// of CSS: every container with multiple children needs display:flex, and colors are literal hsl().
// Required under `output: export`: with no server, the card must be generated at build, like the
// sitemap route. Without this Next refuses to statically export the image route.
export const dynamic = "force-static";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${STRINGS.app.name}, the open-source self-hosted Pipedrive alternative`;

const BG = "hsl(222, 84%, 5%)";
const FG = "hsl(210, 40%, 98%)";
const MUTED = "hsl(215, 20%, 70%)";
const BORDER = "hsl(215, 25%, 22%)";
const CARD = "hsl(222, 47%, 11%)";

export default function OpengraphImage(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: BG,
        padding: "80px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex" }}>
        <span
          style={{
            display: "flex",
            fontSize: 28,
            color: MUTED,
            border: `1px solid ${BORDER}`,
            backgroundColor: CARD,
            borderRadius: 9999,
            padding: "10px 24px",
          }}
        >
          {LANDING_STRINGS.hero.badge}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{ display: "flex", fontSize: 96, fontWeight: 700, color: FG, letterSpacing: -2 }}
        >
          {STRINGS.app.name}
        </div>
        <div style={{ display: "flex", marginTop: 12, fontSize: 44, color: FG, letterSpacing: -1 }}>
          The open-source, self-hosted Pipedrive alternative
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 30, color: MUTED }}>
        Pipeline, deals, contacts, and two-way Gmail. On your own infrastructure. warpdrivecrm.com
      </div>
    </div>,
    size,
  );
}
