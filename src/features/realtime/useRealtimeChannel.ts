"use client";
import { useEffect } from "react";
import { trpc } from "@/lib/trpc-client";
import { useRealtimeUrl } from "./RealtimeUrlProvider";
import { type ChannelHandler, WsMultiplexer } from "./wsMultiplexer";

let multiplexer: WsMultiplexer | null = null;
let ticketMinter: (() => Promise<string>) | null = null;

function getMultiplexer(url: string): WsMultiplexer {
  if (multiplexer === null) {
    multiplexer = new WsMultiplexer(url, () =>
      ticketMinter !== null
        ? ticketMinter()
        : Promise.reject(new Error("no realtime ticket minter")),
    );
  }
  return multiplexer;
}

export function useRealtimeChannel(channel: string | null, onFrame: ChannelHandler): void {
  const url = useRealtimeUrl();
  const mutateAsync = trpc.realtime.ticket.useMutation().mutateAsync;
  useEffect(() => {
    ticketMinter = () => mutateAsync().then((r) => r.ticket);
    if (channel === null) return;
    return getMultiplexer(url).subscribe(channel, onFrame);
  }, [channel, onFrame, mutateAsync, url]);
}
