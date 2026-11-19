// CODE.md 9an.5 (2.38, Part E-b): every pop-up event that popupsFor handles is on the list the host
// uses to wait for a phone (POPUP_EVENTS). A new pop-up added later without the list fails here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POPUP_EVENTS, makesPopup } from '../../src/ui/popupevents.ts';
import type { SessionEvent } from '../../src/session/types.ts';

test('every event type popupsFor handles is on the host-wait list', () => {
  const src = readFileSync(new URL('../../src/ui/game.ts', import.meta.url), 'utf8');
  const start = src.indexOf('function popupsFor(');
  assert.ok(start > 0, 'popupsFor not found');
  const end = src.indexOf('\n}\n', start);
  const body = src.slice(start, end);
  const types = [...body.matchAll(/case '([a-zA-Z]+)':/g)].map((m) => m[1]);
  assert.ok(types.length > 15, 'the case list was read');
  for (const t of types) assert.ok(POPUP_EVENTS.has(t as SessionEvent['type']), `${t} is missing from POPUP_EVENTS`);
});

test('a take request makes a pop-up for everyone except the asker and the asked', () => {
  const e = { type: 'takeRequested', requester: 'p1', target: 'p2' } as unknown as SessionEvent;
  assert.equal(makesPopup(e, 'p1'), false);
  assert.equal(makesPopup(e, 'p2'), false);
  assert.equal(makesPopup(e, 'p3'), true);
});

test('a refused watch is a notice now (9aq.3): no pop-up and no host wait, for anyone', () => {
  const e = { type: 'peekAnswered', viewer: 'p1', target: 'p2', accepted: false } as unknown as SessionEvent;
  assert.equal(makesPopup(e, 'p1'), false);
  assert.equal(makesPopup(e, 'p2'), false);
  const ok = { type: 'peekAnswered', viewer: 'p1', target: 'p2', accepted: true } as unknown as SessionEvent;
  assert.equal(makesPopup(ok, 'p1'), false);
});

test('an event that never makes a pop-up is not on the list', () => {
  const e = { type: 'cardPlayed' } as unknown as SessionEvent;
  assert.equal(makesPopup(e, 'p1'), false);
});
