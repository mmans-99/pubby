/**
 * 2.20: joins names for "Waiting for Ben and Fay" and the like.
 * One place, so the lobby, the session's error text and the screens say the same thing.
 */
export function joinNames(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
