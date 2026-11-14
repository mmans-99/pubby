/**
 * Back up and restore stats (CODE.md 9ad.5b, Part F, 2.34). This is the phone side;
 * the rules (what the file holds, how two copies merge) are in src/session/backup.ts.
 */
import { makeBackup, mergeBackup, readBackup, type Backup } from '../session/backup.ts';
import { h } from './dom.ts';
import { shareCsv, type CsvSheet } from './history.ts';
import { loadProfiles, loadRecords, loadVsProfiles, saveProfiles, saveRecords, saveVsProfiles } from './storage.ts';
import { say, update } from './store.ts';
import { VERSION_FULL } from './version.ts';

/** Profiles screen → Back up stats: the share sheet with `pubby-backup-<date>.json` (or the text sheet). */
export async function backUpStats(): Promise<void> {
  const backup = makeBackup(loadProfiles(), loadVsProfiles(), loadRecords(), VERSION_FULL, Date.now());
  const day = new Date().toISOString().slice(0, 10);
  const sheet: CsvSheet = { title: 'Pubby backup', filename: `pubby-backup-${day}.json`, csv: JSON.stringify(backup, null, 1) };
  await shareCsv(sheet, 'application/json');
}

/**
 * Profiles screen → Restore from backup: pick a file, check it, then confirm.
 * `inGame(name)` says whether a profile is in the game in progress (it can't change then).
 */
export function restoreFromBackup(inGame: (name: string) => boolean): void {
  // Created on each tap and not kept in the page, so redraws never touch it.
  const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.remove();
    if (file) void readPicked(file, inGame);
  });
  document.body.appendChild(input);
  input.click();
}

async function readPicked(file: File, inGame: (name: string) => boolean): Promise<void> {
  let raw: unknown = null;
  try { raw = JSON.parse(await file.text()); } catch { raw = null; }
  const b = readBackup(raw);
  if (!b) { say("That isn't a Pubby backup."); return; }
  if (Object.keys(b.profiles).some(inGame)) { say('Finish or close the current game first.'); return; }
  confirmRestore(b);
}

/** The confirm panel: how much is in the file, then Add to this phone or Cancel. */
function confirmRestore(b: Backup): void {
  const close = (): void => overlay.remove();
  const profileCount = Object.keys(b.profiles).length;
  const when = new Date(b.savedAt).toLocaleDateString();
  const overlay: HTMLElement = h('div', { class: 'overlay', onclick: (e: Event) => { if (e.target === e.currentTarget) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Restore from backup' },
      h('div', { class: 'sheet-head' },
        h('h2', null, 'Restore from backup'),
        h('button', { class: 'ghost', onclick: close }, 'Cancel'),
      ),
      h('p', null, `This backup has ${profileCount} ${profileCount === 1 ? 'profile' : 'profiles'} and ${b.records.length} ${b.records.length === 1 ? 'game' : 'games'} (saved ${when}, version ${b.version}). Add it to this phone?`),
      h('p', { class: 'muted small' }, 'Nothing is removed. A profile already on this phone keeps the stats with more games.'),
      h('div', { class: 'row' },
        h('button', { class: 'grow', onclick: () => { close(); applyBackup(b); } }, 'Add to this phone'),
        h('button', { class: 'grow secondary', onclick: close }, 'Cancel'),
      ),
    ),
  );
  document.body.appendChild(overlay);
}

/** Merges the backup into this phone's three saved lists, then says what changed. */
function applyBackup(b: Backup): void {
  const before = loadRecords().length;
  const merged = mergeBackup({ profiles: loadProfiles(), vsProfiles: loadVsProfiles(), records: loadRecords() }, b);
  const saved = saveProfiles(merged.profiles) && saveVsProfiles(merged.vsProfiles) && saveRecords(merged.records);
  if (!saved) { say('Could not save everything to this phone. Some stats may not be restored.'); return; }
  update({ profiles: merged.profiles });
  const games = merged.records.length - before;
  say(`Added ${merged.added.length} profiles, updated ${merged.replaced.length}, ${games} games.`);
}
