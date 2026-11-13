import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAME_MAX, frame, PING_TEXT, PONG_TEXT, readFrame, RELAY_PROTOCOL } from '../../src/net/relayproto.ts';

test('a frame reads back as its header and payload', () => {
  const text = frame({ c: 'to', to: 'o3' }, '{"t":"game"}');
  assert.equal(text, '{"c":"to","to":"o3"}\n{"t":"game"}');
  assert.deepEqual(readFrame(text), { header: { c: 'to', to: 'o3' }, payload: '{"t":"game"}' });
});

test('an empty payload is allowed', () => {
  assert.deepEqual(readFrame(frame({ c: 'update', seats: 3, started: false })), {
    header: { c: 'update', seats: 3, started: false },
    payload: '',
  });
});

test('only the first newline splits the header; the payload keeps its newlines', () => {
  const payload = 'line one\nline two\n\nline three';
  const back = readFrame(frame({ c: 'from', from: 'o1' }, payload));
  assert.equal(back?.payload, payload);
});

test('ping and pong are not frames', () => {
  assert.equal(readFrame(PING_TEXT), null);
  assert.equal(readFrame(PONG_TEXT), null);
});

test('bad frames give null', () => {
  assert.equal(readFrame('{"c":"to"}'), null, 'no newline');
  assert.equal(readFrame('not json\nbody'), null, 'header is not JSON');
  assert.equal(readFrame('[1,2]\nbody'), null, 'header is an array');
  assert.equal(readFrame('"text"\nbody'), null, 'header is a string');
  assert.equal(readFrame('null\nbody'), null, 'header is null');
  assert.equal(readFrame('{"seats":3}\nbody'), null, 'header has no c');
  assert.equal(readFrame('{"c":4}\nbody'), null, 'c is not a string');
});

test('a frame longer than FRAME_MAX gives null', () => {
  const big = frame({ c: 'to', to: 'o1' }, 'x'.repeat(FRAME_MAX));
  assert.ok(big.length > FRAME_MAX);
  assert.equal(readFrame(big), null);
  const just = frame({ c: 'to', to: 'o1' }, 'x'.repeat(FRAME_MAX - 30));
  assert.ok(just.length <= FRAME_MAX);
  assert.notEqual(readFrame(just), null);
});

test('the protocol number is 1', () => {
  assert.equal(RELAY_PROTOCOL, 1);
});
