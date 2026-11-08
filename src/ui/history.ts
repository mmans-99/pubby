/**
 * Saved games and profile history on this phone (PROJECT.md section 10).
 *
 * - `saveFinishedGame()`: when a session ends, builds the game record, saves it
 *   on the phone and adds the game to the profile of every player in it whose
 *   profile is on this phone. Each game is added once (record id).
 * - Past games screen: every saved game, newest first, with final standings,
 *   "Share game stats" (session CSV) and delete.
 * - Profile details (on the profiles screen): overall totals, slapped by most
 *   and slapped most, "Share profile stats" (profile CSV).
 * - Sharing: the phone's share sheet with a .csv file. If the phone or browser
 *   can't share files, a sheet shows the CSV with Copy and Download buttons.
 */

import { icon } from './icons.ts';
import {
  addGameToProfiles, buildGameRecord, profileCsv, profileRivals, sessionCsv,
  type GameRecord, type ProfileStats,
} from '../session/record.ts';
import type { PlayerId, Session } from '../session/types.ts';
import { h } from './dom.ts';
import { deleteRecord, loadRecords, saveProfiles, saveRecord } from './storage.ts';
import { getState, say, update } from './store.ts';

// ---------------------------------------------------------------------------
// Saving at the end of a game
// ---------------------------------------------------------------------------

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch { /* fall through */ }
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export interface SavedResult {
  readonly recordId: string;
  /** Profiles the game was added to. */
  readonly profiles: readonly string[];
  readonly ok: boolean;
}

/**
 * Save the record of an ended session and add it to the profiles on this
 * phone. A profile deleted during the game is not brought back.
 */
export function saveFinishedGame(s: Session): SavedResult {
  const rec = buildGameRecord(s, new Date(), newId());
  const current = getState().profiles;
  const onPhone = rec.players.map((p) => p.profileName).filter((n) => n in current);
  const profiles = addGameToProfiles(current, rec, onPhone);
  const okRecord = saveRecord(rec);
  const okProfiles = saveProfiles(profiles);
  update({ profiles }, false);
  return { recordId: rec.id, profiles: onPhone, ok: okRecord && okProfiles };
}

export function findRecord(id: string | undefined): GameRecord | null {
  if (!id) return null;
  return loadRecords().find((r) => r.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Sharing a CSV
// ---------------------------------------------------------------------------

export interface CsvSheet {
  readonly title: string;
  readonly filename: string;
  readonly csv: string;
}

function safeName(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'pubby';
}

function dateTag(iso: string): string {
  return iso.slice(0, 16).replace('T', '-').replace(':', '');
}

/** Open the share sheet with the CSV as a file, or show the CSV sheet instead. */
export async function shareCsv(sheet: CsvSheet): Promise<void> {
  try {
    const file = new File([sheet.csv], sheet.filename, { type: 'text/csv' });
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: sheet.title });
      return;
    }
  } catch (e) {
    // The player closed the share sheet: nothing more to do.
    if (e instanceof DOMException && e.name === 'AbortError') return;
  }
  update({ csvSheet: sheet });
}

export function gameCsvSheet(rec: GameRecord): CsvSheet {
  return { title: 'Pubby game stats', filename: `pubby-game-${dateTag(rec.savedAt)}.csv`, csv: sessionCsv(rec) };
}

export function profileCsvSheet(p: ProfileStats): CsvSheet {
  return { title: `Pubby profile: ${p.profileName}`, filename: `pubby-profile-${safeName(p.profileName)}.csv`, csv: profileCsv(p) };
}

/** Fallback when the share sheet can't take a file: show the CSV, Copy and Download. */
export function csvSheetLayer(): HTMLElement | null {
  const sheet = getState().csvSheet;
  if (!sheet) return null;
  const close = (): void => update({ csvSheet: null });
  const box = h('textarea', { class: 'csv-box', readonly: true, rows: 10, 'aria-label': 'CSV text' }, sheet.csv) as HTMLTextAreaElement;
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(sheet.csv);
      say('Copied. Paste it into a note, a chat or a spreadsheet.');
    } catch {
      box.focus();
      box.select();
      say('Could not copy by itself. The text is selected: use Copy from the phone menu.');
    }
  };
  const download = (): void => {
    try {
      const url = URL.createObjectURL(new Blob([sheet.csv], { type: 'text/csv' }));
      const a = h('a', { href: url, download: sheet.filename }) as HTMLAnchorElement;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      say('This browser blocked the download. Use Copy instead.');
    }
  };
  return h('div', { class: 'overlay', onclick: (e) => { if (e.target === e.currentTarget) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': sheet.title },
      h('div', { class: 'sheet-head' },
        h('h2', null, sheet.title),
        h('button', { class: 'ghost', onclick: close }, 'Close'),
      ),
      h('p', { class: 'muted small' }, 'This phone can’t send the file straight to the share sheet, so here it is as text. It opens in a spreadsheet as a .csv file.'),
      box,
      h('div', { class: 'row' },
        h('button', { class: 'grow', onclick: () => { void copy(); } }, 'Copy'),
        h('button', { class: 'grow secondary', onclick: download }, 'Download .csv'),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Game over: saved note and share button
// ---------------------------------------------------------------------------

export function gameOverSaved(recordId: string | undefined): HTMLElement {
  const rec = findRecord(recordId);
  if (!rec) {
    return h('p', { class: 'warn' }, 'This game could not be saved on this phone (storage full or blocked), so it isn’t in Past games or the profiles.');
  }
  const added = rec.players.filter((p) => getState().profiles[p.profileName]?.games.includes(rec.id)).map((p) => p.profileName);
  return h('section', { class: 'panel' },
    h('h2', null, 'Saved on this phone'),
    h('p', { class: 'muted small' },
      added.length ? `Added to the profiles of ${added.join(', ')}. ` : '',
      'Find it again in Past games on the home screen.'),
    h('button', { onclick: () => { void shareCsv(gameCsvSheet(rec)); } }, icon('share'), ' Share game stats (CSV)'),
  );
}

// ---------------------------------------------------------------------------
// Past games screen
// ---------------------------------------------------------------------------

function nameIn(rec: GameRecord, id: PlayerId): string {
  const p = rec.players.find((x) => x.id === id);
  return p ? p.sessionName : id;
}

function when(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function pastGamesScreen(back: () => void): HTMLElement {
  const records = loadRecords();
  const open = getState().openRecord;
  return h('main', { class: 'screen' },
    h('div', { class: 'top-bar' },
      h('button', { class: 'ghost', onclick: back }, '‹ Back'),
      h('h1', null, 'Past games'),
    ),
    h('p', { class: 'muted' }, 'Every finished game is saved on this phone.'),
    records.length === 0
      ? h('p', { class: 'empty' }, 'No finished games yet. A game is saved here when it ends.')
      : h('ul', { class: 'list' }, records.map((rec) => recordRow(rec, open === rec.id))),
  );
}

function recordRow(rec: GameRecord, open: boolean): HTMLElement {
  const winners = rec.final.winners.map((id) => nameIn(rec, id)).join(' & ');
  const rounds = rec.rounds.length;
  const key = `delrec:${rec.id}`;
  const armed = getState().armed === key;
  const head = h('button', {
    class: 'record-head', 'aria-expanded': open ? 'true' : 'false',
    onclick: () => update({ openRecord: open ? null : rec.id, armed: null }),
  },
    h('div', { class: 'grow' },
      h('div', { class: 'name' }, icon('trophy'), ` ${winners}`),
      h('div', { class: 'muted small' }, `${when(rec.savedAt)} · ${rec.playerCount} players · ${rounds} ${rounds === 1 ? 'round' : 'rounds'}`),
    ),
    h('span', { class: 'muted', 'aria-hidden': 'true' }, open ? '▲' : '▼'),
  );
  if (!open) return h('li', { class: 'list-row record' }, head);
  const labels = rec.ultimate;
  return h('li', { class: 'list-row record open' },
    head,
    h('ol', { class: 'standings' }, rec.final.standings.map((id) =>
      h('li', null,
        h('span', { class: 'grow' }, nameIn(rec, id),
          labels.winner === id ? h('span', { class: 'tag gold' }, 'Ultimate Winner') : null,
          labels.losers.includes(id) ? h('span', { class: 'tag' }, 'Ultimate Loser') : null),
        h('b', null, `${rec.final.scores[id] ?? 0} pts`)))),
    h('p', { class: 'muted small' },
      rec.target !== null ? `Target ${rec.target} points. ` : 'No target. ',
      rec.jokerRuleEnabled ? `Joker rule on (${rec.jokerTotal}).` : 'Joker rule off.'),
    h('div', { class: 'row' },
      h('button', { class: 'grow', onclick: () => { void shareCsv(gameCsvSheet(rec)); } }, icon('share'), ' Share game stats'),
      h('button', {
        class: armed ? 'danger' : 'ghost',
        onclick: () => {
          if (!armed) { update({ armed: key }); return; }
          deleteRecord(rec.id);
          update({ armed: null, openRecord: null });
        },
      }, armed ? 'Tap to delete' : 'Delete'),
    ),
    armed ? h('p', { class: 'muted small' }, 'Deleting a game here doesn’t change the profile totals.') : null,
  );
}

// ---------------------------------------------------------------------------
// Profile details (opened from the profiles screen)
// ---------------------------------------------------------------------------

export function profileDetails(p: ProfileStats): HTMLElement {
  const r = profileRivals(p);
  const row = (label: string, value: string | number): HTMLElement =>
    h('div', { class: 'stat-row' }, h('span', { class: 'grow' }, label), h('b', null, String(value)));
  return h('div', { class: 'profile-details' },
    row('Games played', p.gamesPlayed),
    row('Points', p.points),
    row('Round wins', p.roundWins),
    row('Round losses', p.roundLosses),
    row('Bottom two', p.bottomTwo),
    row('Ultimate Winner', p.ultimateWinner),
    row('Ultimate Loser', p.ultimateLoser),
    row('Times slapped', p.timesSlapped),
    row('Slaps given', p.slapsGiven),
    row('Slapped by most', r.slappedByMost.join(' & ') || '—'),
    row('Slapped most', r.slappedMost.join(' & ') || '—'),
    h('button', { onclick: () => { void shareCsv(profileCsvSheet(p)); } }, icon('share'), ' Share profile stats (CSV)'),
  );
}
