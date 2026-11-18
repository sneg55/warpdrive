"use client";
import { useEffect } from "react";
import { clientEnv } from "@/config/clientEnv";
import { trpc } from "@/lib/trpc-client";
import { type ChannelHandler, WsMultiplexer } from "./wsMultiplexer";

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

export function useRealtimeChannel(channel: string | null, onFrame: ChannelHandler): void {
  const mutateAsync = trpc.realtime.ticket.useMutation().mutateAsync;
  useEffect(() => {
    ticketMinter = () => mutateAsync().then((r) => r.ticket);
    if (channel === null) return;
    return getMultiplexer().subscribe(channel, onFrame);
  }, [channel, onFrame, mutateAsync]);
}
