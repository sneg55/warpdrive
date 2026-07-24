/**
 * Resource bounds and cadences for the WebSocket listener.
 *
 * /_ws is publicly reachable (Caddy proxies it straight through, see Caddyfile) and accepts a
 * TCP connection from anyone before any credential is presented, so everything an unauthenticated
 * peer can consume needs a ceiling.
 */

// How often to re-validate that a bound session is still live AND its user still active
// (ops spec A1 step 4: "periodic heartbeat (every 5 min)").
export const WS_HEARTBEAT_MS = 5 * 60 * 1000;

// How long an accepted socket may stay unauthenticated before it is closed.
//
// A socket that connected and then said nothing used to live forever: dispatch() only runs when
// a message arrives, so its "no conn yet, close 4401" branch could never fire for a client that
// simply stayed quiet. Ten seconds is far more than the round trip needed to fetch a ticket from
// the tRPC endpoint and send the auth frame.
export const WS_AUTH_TIMEOUT_MS = 10_000;

// Largest inbound frame accepted. Every legitimate one is a small JSON object of one of three
// shapes (auth | subscribe | unsubscribe); the biggest realistic payload is a ticket JWT, a few
// hundred bytes. The `ws` library default is 100 MB, which an unauthenticated peer could make
// the process buffer at will.
export const WS_MAX_PAYLOAD_BYTES = 64 * 1024;

// Backstop on concurrently held sockets, so file descriptors and per-socket state cannot be
// exhausted. Well above any real fan-out for a single-tenant CRM (one socket per browser tab).
export const WS_MAX_CONNECTIONS = 1_000;

// Close codes. 4xxx is the application-defined range.
// Distinct from 4401 (auth was attempted and rejected) so an operator reading logs can tell
// "client never spoke" apart from "client presented a bad ticket".
export const WS_CLOSE_AUTH_TIMEOUT = 4408;
// Protocol-defined: 1013 "try again later". Capacity, not a client error.
export const WS_CLOSE_AT_CAPACITY = 1013;

// After a capacity rejection, how long to wait for the peer to acknowledge the close before
// forcibly destroying the socket. A cooperating client acks in well under this and its 'close'
// fires first; a peer that ignores the close frame would otherwise keep its file descriptor (and
// its slot in wss.clients) indefinitely, so the ceiling would not actually bound held sockets.
// This bounds a hostile peer's hold to roughly this window rather than the default close timeout.
export const WS_CAPACITY_CLOSE_GRACE_MS = 1_000;
