// CODE.md 9an.5 (2.38, Part E-c): the host's record of phones that still owe an answer for a
// pop-up. Pure bookkeeping, so it is unit tested without a browser. Per player, not per link.

export interface PopupWaits {
  /** Last update sequence number sent to each player. */
  seq: Record<string, number>;
  /** The sequence a player must acknowledge before the host stops waiting for it. */
  waitSeq: Record<string, number>;
  /** Highest sequence a player has acknowledged. */
  ackSeq: Record<string, number>;
}

export function newWaits(): PopupWaits {
  return { seq: {}, waitSeq: {}, ackSeq: {} };
}

/** The next sequence number for a player (1, 2, 3 …). */
export function nextSeq(w: PopupWaits, p: string): number {
  w.seq[p] = (w.seq[p] ?? 0) + 1;
  return w.seq[p];
}

/** An update that may open a pop-up was sent: the host waits for `seq` from this player. */
export function startWait(w: PopupWaits, p: string, seq: number): void {
  w.waitSeq[p] = seq;
}

/** The phone says it has drawn update `seq`. Clears the wait once that update is covered. */
export function noteAck(w: PopupWaits, p: string, seq: number): void {
  w.ackSeq[p] = Math.max(w.ackSeq[p] ?? 0, seq);
  const need = w.waitSeq[p];
  if (need !== undefined && seq >= need) delete w.waitSeq[p];
}

/** Stop waiting for this player (away, link closed, lost-message guard, new round start). */
export function clearWait(w: PopupWaits, p: string): void {
  delete w.waitSeq[p];
}

/** Players the host is still waiting on, in the order given. */
export function pendingPlayers(w: PopupWaits, players: readonly string[]): string[] {
  return players.filter((p) => w.waitSeq[p] !== undefined);
}
