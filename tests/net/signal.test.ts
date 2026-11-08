import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CodeError, codeFromText, codeToDescription, lobbyLink, packSdp, parseCandidate, parseSdp, unpackCode } from '../../src/net/signal.ts';
import { makeQr } from '../../src/net/qr.ts';

// A data-channel offer as Chrome writes it (addresses and keys made up).
const CHROME_OFFER = [
  'v=0',
  'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'a=extmap-allow-mixed',
  'a=msid-semantic: WMS',
  'm=application 50000 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 192.168.1.23',
  'a=candidate:1 1 udp 2122260223 192.168.1.23 50000 typ host generation 0 network-id 1 network-cost 10',
  'a=candidate:2 1 udp 2122262783 fe80::1:2:3:4 50001 typ host generation 0 network-id 2',
  'a=candidate:3 1 tcp 1518280447 192.168.1.23 9 typ host tcptype active generation 0',
  'a=candidate:4 1 udp 2122260223 1f2e3d4c-aaaa-bbbb-cccc-111122223333.local 50002 typ host generation 0',
  'a=ice-ufrag:Ab3/',
  'a=ice-pwd:qwertyuiopasdfghjklzxcvb',
  'a=ice-options:trickle',
  'a=fingerprint:sha-256 ' + Array.from({ length: 32 }, (_, i) => (i * 7).toString(16).padStart(2, '0').toUpperCase()).join(':'),
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144',
  '',
].join('\r\n');

test('packs an offer into a short code and back', () => {
  const code = packSdp(CHROME_OFFER, 'offer');
  assert.ok(code.startsWith('PUBBY1~o~Ab3/~'));
  assert.ok(code.length < 220, `code is ${code.length} characters`);
  const p = unpackCode(code);
  assert.equal(p.kind, 'offer');
  assert.equal(p.ufrag, 'Ab3/');
  assert.equal(p.pwd, 'qwertyuiopasdfghjklzxcvb');
  assert.deepEqual(Array.from(p.fingerprint), Array.from({ length: 32 }, (_, i) => (i * 7) & 0xff));
});

test('keeps UDP host candidates only, IPv4 first, then .local, then IPv6', () => {
  const p = unpackCode(packSdp(CHROME_OFFER, 'offer'));
  assert.deepEqual(p.candidates, [
    { addr: '192.168.1.23', port: 50000 },
    { addr: '1f2e3d4c-aaaa-bbbb-cccc-111122223333.local', port: 50002 },
    { addr: 'fe80::1:2:3:4', port: 50001 },
  ]);
});

test('rebuilt SDP carries the same fields and the right setup role', () => {
  const offer = codeToDescription(unpackCode(packSdp(CHROME_OFFER, 'offer')));
  assert.equal(offer.type, 'offer');
  assert.match(offer.sdp!, /a=setup:actpass/);
  const again = parseSdp(offer.sdp!, 'offer');
  assert.deepEqual(again, parseSdp(CHROME_OFFER, 'offer'));
  const answer = codeToDescription({ ...unpackCode(packSdp(CHROME_OFFER, 'offer')), kind: 'answer' });
  assert.equal(answer.type, 'answer');
  assert.match(answer.sdp!, /a=setup:active/);
});

test('rejects codes that are not Pubby codes or are damaged', () => {
  assert.throws(() => unpackCode('https://example.com'), CodeError);
  assert.throws(() => unpackCode('PUBBY1~x~a~b~c~'), CodeError);
  assert.throws(() => unpackCode('PUBBY1~o~a~b~short~1.2.3.4:5'), CodeError);
});

test('parses candidate lines', () => {
  assert.deepEqual(parseCandidate('candidate:1 1 udp 2122260223 10.0.0.2 6000 typ host generation 0'),
    { component: 1, protocol: 'udp', addr: '10.0.0.2', port: 6000, type: 'host' });
  assert.equal(parseCandidate('candidate:junk'), null);
});

test('QR codes: size grows with the text, finder patterns in three corners', () => {
  const small = makeQr('PUBBY');
  assert.equal(small.version, 1);
  assert.equal(small.size, 21);
  const code = makeQr(packSdp(CHROME_OFFER, 'offer'), 'M');
  assert.ok(code.version <= 10, `version ${code.version}`);
  assert.equal(code.size, code.version * 4 + 17);
  const m = code.modules;
  const n = code.size;
  for (const [x, y] of [[0, 0], [n - 7, 0], [0, n - 7]] as const) {
    // Outer ring dark, ring inside it light, 3x3 centre dark.
    assert.equal(m[y]![x], true);
    assert.equal(m[y + 1]![x + 1], false);
    assert.equal(m[y + 3]![x + 3], true);
  }
  // Same text gives the same code (mask choice is deterministic).
  assert.deepEqual(makeQr('hello').modules, makeQr('hello').modules);
});

test('lobby links: the host code as a link opens Pubby joining', () => {
  const code = packSdp(CHROME_OFFER, 'offer');
  const link = lobbyLink('https://mmans-99.github.io/pubby/', code);
  assert.equal(link, `https://mmans-99.github.io/pubby/#lobby=${code}`);
  assert.equal(codeFromText(link), code);
  assert.deepEqual(unpackCode(link), unpackCode(code));
  // Some browsers escape characters in the address; still reads.
  const escaped = link.replace(/\//g, (m, i) => (i > 40 ? '%2F' : m)).replace(/\+/g, '%2B');
  assert.deepEqual(unpackCode(escaped), unpackCode(code));
  // A QR code longer by the address still fits a small version.
  assert.ok(makeQr(link, 'M').version <= 10, `version ${makeQr(link, 'M').version}`);
});
