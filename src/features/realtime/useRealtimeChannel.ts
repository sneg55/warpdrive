"use client";
import { useEffect } from "react";
import { clientEnv } from "@/config/clientEnv";
import { trpc } from "@/lib/trpc-client";
import { type ChannelHandler, WsMultiplexer } from "./wsMultiplexer";

// One multiplexer per tab. The ticket minter is a mutable reference kept fresh by every mounted
// subscriber's effect, so the multiplexer always mints through a live tRPC mutation even after the
// component that first created it unmounts. Client module state is per-tab, so this singleton is
// safe (unlike server module singletons, which can duplicate across bundle layers).
let multiplexer: WsMultiplexer | null = null;
let ticketMinter: (() => Promise<string>) | null = null;

function getMultiplexer(): WsMultiplexer {
  if (multiplexer === null) {
    multiplexer = new WsMultiplexer(clientEnv.WS_PUBLIC_URL, () =>
      ticketMinter !== null
        ? ticketMinter()
        : Promise.reject(new Error("no realtime ticket minter")),
    );
  }
  return multiplexer;
}

// Subscribe a component to a realtime channel over the shared tab socket, replacing the old
// one-socket-per-hook wiring. onFrame receives the channel's event/presence frames and a synthetic
// { kind: "reconnect" } when the socket drops (so callers refetch, as their old onclose did). Pass
// channel=null to opt out (e.g. before an id is known). onFrame must be stable across renders (wrap
// in useCallback) or the subscription re-registers each render.
export function useRealtimeChannel(channel: string | null, onFrame: ChannelHandler): void {
  const mutateAsync = trpc.realtime.ticket.useMutation().mutateAsync;
  useEffect(() => {
    ticketMinter = () => mutateAsync().then((r) => r.ticket);
    if (channel === null) return;
    return getMultiplexer().subscribe(channel, onFrame);
  }, [channel, onFrame, mutateAsync]);
}
