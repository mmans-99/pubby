/**
 * The browser side of voice chat (CODE.md 9aq.9, Part G, 3.0.0): one WebRTC link
 * per other person, the mic, and the level meters. The logic that decides who
 * talks when is in voice.ts, where the tests are. Nothing here runs in Nearby games.
 */
import type { VoiceData } from './lobby.ts';
import type { LinkState, VoiceLink } from './voice.ts';
import { ctx } from '../audio/engine.ts';

/** Relay logins from /turn (9aq.9 item 1), as the browser's ICE servers. Set by the lobby. */
let iceServers: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];

export function setVoiceIce(servers: RTCIceServer[]): void {
  iceServers = servers;
}

/** The mic: echo cancelling, noise suppression and auto gain on (9aq.9 item 4). */
export async function acquireMicTrack(): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  });
  const track = stream.getAudioTracks()[0];
  if (!track) throw new Error('no audio track');
  return track;
}

export function releaseMicTrack(track: unknown): void {
  (track as MediaStreamTrack).stop();
}

/** Voice elements that the browser paused before a tap (9aq.9 item 5). */
const voiceEls = new Set<HTMLAudioElement>();
let tapWatched = false;
function watchTap(): void {
  if (tapWatched) return;
  tapWatched = true;
  document.addEventListener('pointerdown', () => {
    for (const a of voiceEls) if (a.paused) void a.play().catch(() => undefined);
  }, { passive: true });
}

const MAX_BITRATE = 32000;

/** The voice volume, 0 to 1 (9aq.12 item 2). Android and desktop only: iPhone ignores audio.volume. */
let voiceVolume = 1;
export function setVoiceVolume(v: number): void {
  voiceVolume = Math.min(1, Math.max(0, v));
  for (const a of voiceEls) a.volume = voiceVolume;
}

/** One connection to one other person. `offer` makes the first offer. */
export function makeRtcLink(
  peer: string,
  offer: boolean,
  out: (d: VoiceData) => void,
  state: (s: LinkState) => void,
): VoiceLink {
  void peer;
  const pc = new RTCPeerConnection({ iceServers });
  // The offering side makes the audio transceiver now. The answering side takes the one the
  // offer makes (see `adopt`): a transceiver of its own would never be negotiated.
  let transceiver: RTCRtpTransceiver | null = offer ? pc.addTransceiver('audio', { direction: 'sendrecv' }) : null;
  let track: MediaStreamTrack | null = null;
  let remoteSet = false;
  const queued: RTCIceCandidateInit[] = [];
  let audio: HTMLAudioElement | null = null;
  let analyser: AnalyserNode | null = null;
  let meterSource: MediaStreamAudioSourceNode | null = null;
  let meterStream: MediaStream | null = null;
  let stream: MediaStream | null = null;
  let wantMuted = false;
  const buf = new Uint8Array(512);

  pc.onicecandidate = (e) => {
    if (e.candidate) out({ ice: { candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex } });
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') state('connected');
    else if (pc.connectionState === 'failed') state('failed');
    else state('other');
  };
  pc.ontrack = (e) => {
    stream = e.streams[0] ?? new MediaStream([e.track]);
    audio?.remove();
    audio = document.createElement('audio');
    audio.autoplay = true;
    audio.setAttribute('playsinline', '');
    audio.muted = wantMuted;
    audio.volume = voiceVolume;
    audio.srcObject = stream;
    // Added to the body, not the app root, so a redraw never removes or restarts it.
    document.body.appendChild(audio);
    voiceEls.add(audio);
    watchTap();
    void audio.play().catch(() => undefined);
  };

  /** The answering side: the transceiver that the remote offer made, sending and receiving. */
  function adopt(): void {
    if (transceiver !== null) return;
    transceiver = pc.getTransceivers().find((t) => t.receiver.track.kind === 'audio') ?? null;
    if (transceiver === null) return;
    transceiver.direction = 'sendrecv';
    if (track !== null) void transceiver.sender.replaceTrack(track).catch(() => undefined);
  }

  async function sendOffer(iceRestart: boolean): Promise<void> {
    const o = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
    await pc.setLocalDescription(o);
    out({ sdp: { type: 'offer', sdp: o.sdp ?? '' } });
  }
  if (offer) void sendOffer(false);

  async function flush(): Promise<void> {
    remoteSet = true;
    for (const c of queued.splice(0)) await pc.addIceCandidate(c).catch(() => undefined);
  }

  return {
    async signal(d) {
      if ('sdp' in d) {
        await pc.setRemoteDescription(d.sdp);
        await flush();
        if (d.sdp.type === 'offer') {
          adopt();
          const a = await pc.createAnswer();
          await pc.setLocalDescription(a);
          out({ sdp: { type: 'answer', sdp: a.sdp ?? '' } });
        }
        return;
      }
      if (d.ice === null) return;
      const c: RTCIceCandidateInit = { candidate: d.ice.candidate, sdpMid: d.ice.sdpMid, sdpMLineIndex: d.ice.sdpMLineIndex };
      if (remoteSet) await pc.addIceCandidate(c).catch(() => undefined);
      else queued.push(c);
    },
    setTrack(next) {
      track = next as MediaStreamTrack | null;
      if (transceiver === null) return; // applied by `adopt` once the offer has come
      void transceiver.sender.replaceTrack(track).catch(() => undefined);
      if (track === null) return;
      try {
        const p = transceiver.sender.getParameters();
        if (p.encodings[0]) p.encodings[0].maxBitrate = MAX_BITRATE;
        void transceiver.sender.setParameters(p).catch(() => undefined);
      } catch {
        // Not yet negotiated: the cap is simply not set.
      }
    },
    setMuted(muted) {
      wantMuted = muted;
      if (audio) audio.muted = muted;
    },
    restart() {
      if (offer) void sendOffer(true);
    },
    level() {
      // The audio context only exists after the first tap, so the meter is made on the first read after that.
      // A renegotiation (e.g. at game start) gives a new remote stream; the meter must follow it, or it
      // keeps reading the old, ended track and shows silence.
      if (ctx && stream && stream !== meterStream) {
        meterSource?.disconnect();
        analyser ??= ctx.createAnalyser();
        analyser.fftSize = 512;
        meterSource = ctx.createMediaStreamSource(stream);
        meterSource.connect(analyser);
        meterStream = stream;
      }
      if (!analyser) return 0;
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) {
        const x = (v - 128) / 128;
        sum += x * x;
      }
      return Math.sqrt(sum / buf.length);
    },
    close() {
      pc.close();
      if (audio) {
        voiceEls.delete(audio);
        audio.remove();
        audio = null;
      }
    },
  };
}
