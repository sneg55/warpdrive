import type { StaticImageData } from "next/image";
import contactsInline from "./assets/contacts-1600.webp";
import contactsZoom from "./assets/contacts-3200.webp";
import dealInline from "./assets/deal-workspace-1600.webp";
import dealZoom from "./assets/deal-workspace-3200.webp";
import inboxInline from "./assets/inbox-1600.webp";
import inboxZoom from "./assets/inbox-3200.webp";
import pipelineInline from "./assets/pipeline-1600.webp";
import pipelineZoom from "./assets/pipeline-3200.webp";

export interface Screenshot {
  inline: StaticImageData;
  zoom: StaticImageData;
}

export const SCREENSHOTS = {
  pipeline: { inline: pipelineInline, zoom: pipelineZoom },
  deal: { inline: dealInline, zoom: dealZoom },
  inbox: { inline: inboxInline, zoom: inboxZoom },
  contacts: { inline: contactsInline, zoom: contactsZoom },
} as const satisfies Record<string, Screenshot>;
