// Client-safe shared type for presence users. No server imports here.
export interface PresenceUser {
  userId: string;
  name: string;
}
