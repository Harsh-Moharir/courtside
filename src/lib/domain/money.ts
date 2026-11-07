/** Auction money rules (5.3). The server is authoritative; these mirror it for previews and tests. */
export interface Tier {
  from_amount: number;
  step: number;
}

export function stepFor(tiers: Tier[], bid: number | null): number {
  const b = bid ?? 0;
  let best: Tier | null = null;
  for (const t of tiers) if (t.from_amount <= b && (!best || t.from_amount > best.from_amount)) best = t;
  return best?.step ?? 1;
}

export function minimumNextBid(basePrice: number, currentBid: number | null, tiers: Tier[]): number {
  return currentBid === null ? basePrice : currentBid + stepFor(tiers, currentBid);
}

/** Bid after n steps from the current bid (n=1 is the minimum next bid). */
export function bidAfterSteps(basePrice: number, currentBid: number | null, tiers: Tier[], n: number): number {
  let amount = minimumNextBid(basePrice, currentBid, tiers);
  for (let i = 1; i < n; i++) amount = amount + stepFor(tiers, amount);
  return amount;
}

export function maxBid(opts: { purseRemaining: number; reservePerSlot: number; minSquadSize: number; squadCount: number }): number {
  const v = opts.purseRemaining - opts.reservePerSlot * Math.max(0, opts.minSquadSize - opts.squadCount - 1);
  return Math.max(0, v);
}

export function decayedPrice(price: number, pct: number): number {
  return Math.max(1, Math.floor((price * (100 - pct)) / 100));
}

export function describeTiers(tiers: Tier[], fmt: (n: number) => string = (n) => n.toLocaleString('en-IN')): string {
  const sorted = [...tiers].sort((a, b) => a.from_amount - b.from_amount);
  return sorted
    .map((t, i) => {
      const next = sorted[i + 1];
      const range = next ? `${fmt(t.from_amount)} to ${fmt(next.from_amount - 1)}` : `${fmt(t.from_amount)}+`;
      return `${range}: +${fmt(t.step)}`;
    })
    .join('; ');
}
