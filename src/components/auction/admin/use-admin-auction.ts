'use client';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { rpc, type RpcArgs, type RpcName } from '@/lib/actions/rpc';
import type { Result } from '@/lib/result';
import type { AuctionLot, AuctionSnapshot, AuctionState } from '@/lib/queries/auction';

export interface LotResult {
  state?: AuctionState | null;
  lot?: AuctionLot | null;
  event?: { message: string } | null;
  duplicate?: boolean;
  warnings?: Warnings;
}

export interface Warnings {
  teams_below_min: { team_id: string; name: string; squad_count: number; min: number }[];
  available_players: number;
  unsold_players: number;
}

/**
 * Pessimistic action runner for money screens: one pending key at a time, the screen only changes from the
 * server response (merged into the snapshot) followed by a full refetch.
 */
export function useAuctionActions(
  setData: (fn: (prev: AuctionSnapshot | undefined) => AuctionSnapshot | undefined) => void,
  refetch: () => Promise<void>,
) {
  const [pending, setPending] = useState<string | null>(null);
  const [retry, setRetry] = useState<{ label: string; run: () => Promise<unknown> } | null>(null);

  const run = useCallback(
    async <T extends LotResult = LotResult, N extends RpcName = RpcName>(
      key: string,
      name: N,
      args?: RpcArgs<N>,
      opts: { success?: string | ((d: T) => string | null); silent?: boolean } = {},
    ): Promise<Result<T>> => {
      setPending(key);
      const res = await rpc<T, N>(name, args);
      setPending(null);
      if (res.ok) {
        setRetry(null);
        const d = res.data;
        if (d && (d.state !== undefined || d.lot !== undefined)) {
          setData((prev) => {
            if (!prev) return prev;
            const next = { ...prev };
            if (d.state) next.state = d.state;
            if (d.lot) {
              if (d.lot.status === 'live') next.live = { lot: d.lot, bids: prev.live?.lot.id === d.lot.id ? prev.live.bids : [], player: prev.live?.lot.id === d.lot.id ? prev.live.player : null };
              else if (prev.live?.lot.id === d.lot.id) next.live = null;
            }
            return next;
          });
        }
        if (d?.duplicate) toast.info('That action was already applied.');
        const msg = typeof opts.success === 'function' ? opts.success(d) : opts.success;
        if (msg) toast.success(msg);
        void refetch();
      } else {
        if (res.code === 'NETWORK') {
          setRetry({ label: key, run: () => run(key, name, args, opts) });
        } else if (!opts.silent) {
          toast.error(res.message);
        }
        if (res.code === 'BID_STALE' || res.code === 'LOT_NOT_LIVE' || res.code === 'NOT_FOUND' || res.code === 'SALE_INVALID') void refetch();
      }
      return res;
    },
    [setData, refetch],
  );

  return { pending, run, retry, clearRetry: () => setRetry(null) };
}
