/**
 * CODE.md 9ac.1 (version 2.33): the short tag on each seat's disc. Pure, no DOM.
 * Same players in, same tags out, so every phone shows the same tag.
 *
 * Rules, in order: one letter; if two or more players share it, two letters; then
 * three letters; if still shared, the one letter and a number (S1, S2).
 * Spaces are ignored for the tag. An empty name gives "?".
 */
export function seatInitials(players: readonly { id: string; name: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  const chars = new Map<string, string[]>();
  for (const p of players) {
    const c = Array.from(p.name.replace(/\s+/g, ''));
    if (c.length === 0) { out[p.id] = '?'; continue; }
    chars.set(p.id, c);
  }
  // Upper-case first letter, lower-case after it.
  const tagOf = (c: string[], len: number): string =>
    c.slice(0, len).map((ch, i) => (i === 0 ? ch.toLocaleUpperCase() : ch.toLocaleLowerCase())).join('');
  let open = players.map((p) => p.id).filter((id) => chars.has(id));
  for (let len = 1; len <= 3 && open.length > 0; len++) {
    const count = new Map<string, number>();
    for (const id of open) {
      const k = tagOf(chars.get(id)!, len).toLocaleLowerCase();
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    const stillOpen: string[] = [];
    for (const id of open) {
      const tag = tagOf(chars.get(id)!, len);
      if ((count.get(tag.toLocaleLowerCase()) ?? 0) > 1) stillOpen.push(id);
      else out[id] = tag;
    }
    open = stillOpen;
  }
  // Still shared after three letters: the one letter and a number, in seat order.
  const numbered = new Map<string, number>();
  for (const id of open) {
    const base = tagOf(chars.get(id)!, 1);
    const n = (numbered.get(base) ?? 0) + 1;
    numbered.set(base, n);
    out[id] = `${base}${n}`;
  }
  return out;
}
