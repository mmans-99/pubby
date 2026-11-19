/**
 * 9aq.4 (2.39, Part D): "What happened" in the round note. The last few pop-up and notice lines on this phone,
 * kept in memory only (never saved, never sent). Cleared when a new game starts, not between rounds.
 */

export interface LogLine {
  /** Local clock (ms) when the line was made. */
  at: number;
  text: string;
  /** A big moment (SLAP!, a forfeit, a round end): shown in bold. */
  strong: boolean;
}

/** How many lines are kept. */
export const LOG_KEEP = 8;

let lines: LogLine[] = [];

/** Adds lines, oldest first, and keeps only the last LOG_KEEP. */
export function addLogLines(added: readonly Omit<LogLine, 'at'>[], at: number): void {
  if (!added.length) return;
  lines = [...lines, ...added.map((l) => ({ ...l, at }))].slice(-LOG_KEEP);
}

/** The newest `max` lines, newest first (the note shows them that way). */
export function recentLines(max = 6): LogLine[] {
  return lines.slice(-max).reverse();
}

/** Clears the log (a new game starts). */
export function clearLog(): void {
  lines = [];
}

/** A small time for a line: "now", "10 s", "2 min". Worked out when the note is drawn, so it never ticks. */
export function ageText(at: number, now: number): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 5) return 'now';
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min`;
}
