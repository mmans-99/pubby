import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICE_MAX_AGE_MS, RETRY_MS, STUCK_MS, TalkDetector, VoiceMesh, iceFresh, offersTo, type LinkState, type VoiceDeps, type VoiceLink } from '../../src/net/voice.ts';
import { readVoiceData, readToHost, readToJoiner, setMic, LOBBY_PROTOCOL, type VoiceData, type Lobby } from '../../src/net/lobby.ts';

/** A fake link: records what the mesh did to it. */
interface Fake extends VoiceLink {
  peer: string;
  offer: boolean;
  track: unknown;
  muted: boolean;
  closed: boolean;
  restarts: number;
  lvl: number;
  out: (d: VoiceData) => void;
  state: (s: LinkState) => void;
  signals: VoiceData[];
}

function harness(me = 'c2') {
  const links: Fake[] = [];
  const sent: { to: string; d: VoiceData }[] = [];
  const timers: { f: () => void; ms: number }[] = [];
  const released: unknown[] = [];
  let micAnswer: 'ok' | 'refuse' = 'ok';
  let micN = 0;
  const deps: VoiceDeps = {
    me,
    makeLink(peer, offer, out, state) {
      const l: Fake = {
        peer, offer, out, state, track: null, muted: false, closed: false, restarts: 0, lvl: 0, signals: [],
        signal(d) { this.signals.push(d); },
        setTrack(t) { this.track = t; },
        setMuted(m) { this.muted = m; },
        restart() { this.restarts += 1; },
        level() { return this.lvl; },
        close() { this.closed = true; },
      };
      links.push(l);
      return l;
    },
    send: (to, d) => sent.push({ to, d }),
    acquireMic: async () => {
      if (micAnswer === 'refuse') throw new Error('refused');
      micN += 1;
      return `track${micN}`;
    },
    releaseMic: (t) => released.push(t),
    later: (f, ms) => timers.push({ f, ms }),
  };
  return {
    mesh: new VoiceMesh(deps), links, sent, timers, released,
    refuseMic() { micAnswer = 'refuse'; },
    byPeer: (p: string) => links.find((l) => l.peer === p && !l.closed),
  };
}

const ORDER = ['host', 'c1', 'c2', 'c3'];
const SDP: VoiceData = { sdp: { type: 'offer', sdp: 'v=0' } };
const ICE: VoiceData = { ice: { candidate: 'candidate:1 1 udp 1 1.2.3.4 9 typ host', sdpMid: '0', sdpMLineIndex: 0 } };

test('offersTo: the earlier seat in the order makes the offer, never both and never neither', () => {
  assert.equal(offersTo('host', 'c1', ORDER), true);
  assert.equal(offersTo('c1', 'host', ORDER), false);
  assert.equal(offersTo('c1', 'c3', ORDER), true);
  assert.equal(offersTo('c1', 'zz', ORDER), false, 'someone not in the order gets no offer');
});

test('iceFresh: relay logins are kept 2.5 hours, then asked for again', () => {
  assert.equal(ICE_MAX_AGE_MS, 9_000_000);
  assert.equal(iceFresh(0, ICE_MAX_AGE_MS - 1), true);
  assert.equal(iceFresh(0, ICE_MAX_AGE_MS), false);
});

test('setPeers: one link to each other person, offer by seat order; no link to self', () => {
  const h = harness('c2');
  h.mesh.setPeers(ORDER, ['host', 'c1', 'c2', 'c3']);
  assert.deepEqual(h.mesh.peers().sort(), ['c1', 'c3', 'host']);
  assert.equal(h.byPeer('host')?.offer, false);
  assert.equal(h.byPeer('c1')?.offer, false);
  assert.equal(h.byPeer('c3')?.offer, true);
});

test('setPeers: a person who leaves or goes away closes their link; a returning one gets a new link', () => {
  const h = harness('c2');
  h.mesh.setPeers(ORDER, ['host', 'c1', 'c2', 'c3']);
  const old = h.byPeer('c3');
  h.mesh.setPeers(ORDER, ['host', 'c1', 'c2']);
  assert.equal(old?.closed, true, 'closed when they leave');
  assert.equal(h.byPeer('c3'), undefined);
  h.mesh.setPeers(ORDER, ['host', 'c1', 'c2', 'c3']);
  assert.ok(h.byPeer('c3'), 'a new link when they come back');
});

test('onSignal: passes the signal to its link, and opens the link if the other side started first', () => {
  const h = harness('c2');
  h.mesh.setPeers(ORDER, ['c1']);
  h.mesh.onSignal('c1', SDP);
  assert.deepEqual(h.byPeer('c1')?.signals, [SDP]);
  h.mesh.onSignal('host', ICE);
  assert.deepEqual(h.byPeer('host')?.signals, [ICE], 'a new link for a player not yet listed');
});

test('onSignal: ignores a player who is not in the order, and a signal from self', () => {
  const h = harness('c2');
  h.mesh.onSignal('ghost', SDP);
  h.mesh.onSignal('c2', SDP);
  assert.equal(h.links.length, 0);
});

test('mic on: asks once, puts the track on every link; off: stops it everywhere and releases it', async () => {
  const h = harness('c2');
  h.mesh.setPeers(ORDER, ['host', 'c1', 'c3']);
  await h.mesh.setMic(true);
  assert.equal(h.mesh.micOn, true);
  for (const l of h.links) assert.equal(l.track, 'track1');
  await h.mesh.setMic(true);
  assert.equal(h.links.length, 3, 'turning on twice does not ask again');
  await h.mesh.setMic(false);
  assert.equal(h.mesh.micOn, false);
  assert.deepEqual(h.released, ['track1'], 'the track is stopped so the mic light goes off');
  for (const l of h.links) assert.equal(l.track, null);
});

test('a link opened while the mic is on gets the track at once', async () => {
  const h = harness('c2');
  await h.mesh.setMic(true);
  h.mesh.setPeers(ORDER, ['c1']);
  assert.equal(h.byPeer('c1')?.track, 'track1');
});

test('mic refused: blocked, not on, and no track', async () => {
  const h = harness('c2');
  h.refuseMic();
  await h.mesh.setMic(true);
  assert.equal(h.mesh.micOn, false);
  assert.equal(h.mesh.micBlocked, true);
});

test('mic turned off while the browser is still asking: the track is given back', async () => {
  const h = harness('c2');
  const on = h.mesh.setMic(true);
  await h.mesh.setMic(false);
  await on;
  assert.equal(h.mesh.micOn, false, 'the later "off" wins');
  assert.deepEqual(h.released, ['track1']);
});

test('close: every link and the mic are closed, and nothing is talking afterwards', async () => {
  const h = harness('c2');
  h.mesh.setPeers(ORDER, ['c1', 'c3']);
  await h.mesh.setMic(true);
  h.mesh.close();
  assert.ok(h.links.every((l) => l.closed));
  assert.equal(h.mesh.micOn, false);
  assert.deepEqual(h.released, ['track1']);
  assert.equal(h.mesh.anyoneTalking(), false);
});

test('talking: starts after 150 ms above the level, stops 400 ms after it drops', () => {
  const det = new TalkDetector();
  assert.equal(det.update(0.5, 0), false, 'not yet');
  assert.equal(det.update(0.5, 100), false, 'still not 150 ms');
  assert.equal(det.update(0.5, 160), true, 'talking after 150 ms');
  assert.equal(det.update(0, 200), true, 'a short gap is not a stop');
  assert.equal(det.update(0, 500), true, 'still within 400 ms of the last loud level');
  assert.equal(det.update(0, 620), false, 'stopped 400 ms after the last loud level');
});

test('talking: a blip shorter than 150 ms does not start it', () => {
  const det = new TalkDetector();
  det.update(0.5, 0);
  det.update(0, 100);
  assert.equal(det.update(0.5, 120), false);
  assert.equal(det.update(0.5, 260), false, 'the second blip starts again from 120, so 140 ms is not enough');
});

test('mesh tick: reports a change of talking state, and a muted player never shows as talking', () => {
  const h = harness('c2');
  h.mesh.setPeers(ORDER, ['c1']);
  const l = h.byPeer('c1');
  assert.ok(l);
  l.lvl = 0.5;
  assert.equal(h.mesh.tick(0), false);
  assert.equal(h.mesh.tick(200), true, 'c1 starts talking');
  assert.equal(h.mesh.isTalking('c1'), true);
  assert.equal(h.mesh.anyoneTalking(), true);
  h.mesh.setMuted('c1', true);
  assert.equal(h.mesh.isTalking('c1'), false, 'muted: no ring for this phone');
  assert.equal(h.mesh.anyoneTalking(), false, 'and no music dip');
  assert.equal(l.muted, true, 'and the sound is muted on the link');
});

test('a link to a new person keeps the mute remembered for them', () => {
  const h = harness('c2');
  h.mesh.setMuted('c1', true);
  h.mesh.setPeers(ORDER, ['c1']);
  assert.equal(h.byPeer('c1')?.muted, true);
  assert.equal(h.mesh.isMuted('c1'), true);
});

/** The 3 s retry timers only (each link also has a 10 s stuck check, 9aq.16 Fix 1). */
function retries(h: ReturnType<typeof harness>) {
  return h.timers.filter((t) => t.ms === RETRY_MS);
}

test('a failed link is retried once after 3 s with an ICE restart; a second failure leaves it', () => {
  const h = harness('c2');
  h.mesh.setPeers(ORDER, ['c1']);
  const l = h.byPeer('c1');
  assert.ok(l);
  l.state('failed');
  assert.equal(retries(h).length, 1);
  retries(h)[0]?.f();
  assert.equal(l.restarts, 1);
  l.state('failed');
  assert.equal(retries(h).length, 1, 'no second retry');
});

test('a connection that comes back clears the retry, so the next failure gets one again', () => {
  const h = harness('c2');
  h.mesh.setPeers(ORDER, ['c1']);
  const l = h.byPeer('c1');
  l?.state('failed');
  l?.state('connected');
  l?.state('failed');
  assert.equal(retries(h).length, 2);
});

test('9aq.16 Fix 1: an offer that arrives before the seat order is kept, then given to the link once it opens', () => {
  const h = harness('c2');
  h.mesh.onSignal('c1', SDP);
  h.mesh.onSignal('c1', ICE);
  assert.equal(h.links.length, 0, 'no link before the order is known');
  h.mesh.setPeers(ORDER, ['c1']);
  const l = h.byPeer('c1');
  assert.ok(l);
  assert.equal(l.offer, false);
  assert.deepEqual(l.signals, [SDP, ICE], 'the kept signals arrive once, in order');
  h.mesh.onSignal('c1', ICE);
  assert.equal(l.signals.length, 3, 'later signals go straight to the link');
  assert.equal(h.mesh.earlyCounts()['c1'], undefined, 'kept signals are cleared after they are passed on');
});

test('9aq.16 Fix 1: an early signal from someone who never joins is never used', () => {
  const h = harness('c2');
  h.mesh.onSignal('ghost', SDP);
  h.mesh.setPeers(ORDER, ['c1']);
  assert.equal(h.links.length, 1);
  assert.equal(h.byPeer('ghost'), undefined);
  assert.equal(h.mesh.earlyCounts()['ghost'], 1, 'still kept, not used');
});

test('9aq.16 Fix 1: at most 50 early signals per person; the newest 50 are kept', () => {
  const h = harness('c2');
  for (let i = 0; i < 51; i += 1) h.mesh.onSignal('c1', { ice: { candidate: `candidate:${i}`, sdpMid: '0', sdpMLineIndex: 0 } });
  assert.equal(h.mesh.earlyCounts()['c1'], 50);
  h.mesh.setPeers(ORDER, ['c1']);
  const got = h.byPeer('c1')?.signals ?? [];
  assert.equal(got.length, 50);
  assert.equal((got[0] as { ice: { candidate: string } }).ice.candidate, 'candidate:1', 'the oldest one (0) was dropped');
  assert.equal((got[49] as { ice: { candidate: string } }).ice.candidate, 'candidate:50');
});

test('9aq.16 Fix 1: a link stuck in "new" for 10 s counts as failed once, and gets one ICE restart', () => {
  const h = harness('c2');
  h.mesh.setPeers(ORDER, ['c1']);
  const l = h.byPeer('c1');
  assert.ok(l);
  const stuck = h.timers.filter((t) => t.ms === STUCK_MS);
  assert.equal(stuck.length, 1, 'one stuck check per link');
  stuck[0]?.f();
  assert.equal(retries(h).length, 1, 'the stuck link gets the single retry');
  retries(h)[0]?.f();
  assert.equal(l.restarts, 1);
  // Still stuck after the restart: no second stuck check and no second retry.
  l.state('failed');
  assert.equal(h.timers.filter((t) => t.ms === STUCK_MS).length, 1);
  assert.equal(retries(h).length, 1);
});

test('9aq.16 Fix 1: a link that connected before 10 s is not counted as stuck', () => {
  const h = harness('c2');
  h.mesh.setPeers(ORDER, ['c1']);
  const l = h.byPeer('c1');
  l?.state('connected');
  h.timers.find((t) => t.ms === STUCK_MS)?.f();
  assert.equal(retries(h).length, 0);
});

test('links send their signals out through the host, one person at a time', () => {
  const h = harness('c2');
  h.mesh.setPeers(ORDER, ['c1']);
  h.byPeer('c1')?.out(ICE);
  assert.deepEqual(h.sent, [{ to: 'c1', d: ICE }]);
});

test('lobby: the voice messages read back, a bad one is refused, and the protocol is 14', () => {
  assert.equal(LOBBY_PROTOCOL, 14);
  const sdp = { t: 'vsig', from: 'c1', to: 'c2', d: { sdp: { type: 'answer', sdp: 'x' } } };
  assert.deepEqual(readToHost(sdp), sdp);
  assert.deepEqual(readToJoiner(sdp), sdp);
  assert.deepEqual(readToHost({ t: 'vmic', on: true }), { t: 'vmic', on: true });
  assert.equal(readToHost({ t: 'vmic', on: 'yes' }), null);
  assert.equal(readToHost({ t: 'vsig', from: 'c1', to: 'c2', d: { sdp: { type: 'pranswer', sdp: 'x' } } }), null, 'only offer or answer');
  assert.deepEqual(readVoiceData({ ice: null }), { ice: null }, 'end of candidates');
  assert.equal(readVoiceData({ ice: { candidate: 5 } }), null);
});

test('lobby: the mic state is set per seat and the host copy keeps it', () => {
  const lobby: Lobby = {
    seats: [{ id: 'host', profileName: 'Cat', sessionName: '', isHost: true, connected: true, ready: true }],
    jokers: true, pauseLimit: null, started: false,
  };
  const on = setMic(lobby, 'host', true);
  assert.equal(on.seats[0]?.micOn, true);
  const off = setMic(on, 'host', false);
  assert.equal(off.seats[0]?.micOn, undefined, 'off is not stored, the same as busy');
  assert.deepEqual(setMic(lobby, 'host', false), lobby, 'no change in value');
});
