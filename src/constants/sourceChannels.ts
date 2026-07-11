// Fixed source-channel registry (Pipedrive's "Source channel" is a dropdown, admin-defined per
// account with no public canonical list; this is a warpdrive default). Deals and leads store a KEY
// (e.g. "web_form") in source_channel, resolved to a display name in the UI. Mirrors DEAL_LABELS.
// An admin-configurable list is a deferred later pass.
export const SOURCE_CHANNELS = {
  outbound: { name: "Outbound" },
  inbound: { name: "Inbound" },
  referral: { name: "Referral" },
  web_form: { name: "Web form" },
  chatbot: { name: "Chatbot / live chat" },
  campaign: { name: "Marketing campaign" },
  social: { name: "Social media" },
  event: { name: "Event / conference" },
  advertising: { name: "Advertising" },
  other: { name: "Other" },
} as const;

export type SourceChannelKey = keyof typeof SOURCE_CHANNELS;
export const SOURCE_CHANNEL_KEYS = Object.keys(SOURCE_CHANNELS) as SourceChannelKey[];

export function isSourceChannelKey(v: string): v is SourceChannelKey {
  return v in SOURCE_CHANNELS;
}
