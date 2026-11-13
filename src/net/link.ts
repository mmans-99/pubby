/**
 * One connection between two phones in a game, however it is carried. Nearby
 * play uses a Peer (WebRTC, QR codes); online play uses an OnlineLink (a
 * WebSocket through the room relay, CODE.md 9r). The lobby and the game only
 * see this interface, so they work the same for both.
 */
export interface Link {
  readonly kind: 'nearby' | 'online';
  /** true: the link notices a lost phone itself (online), so the lobby sends no app pings over it. */
  readonly keepsAlive: boolean;
  readonly isOpen: boolean;
  send(msg: unknown): boolean;
  /** Closing on purpose: no onClose. */
  close(): void;
  onOpen: () => void;
  onMessage: (msg: unknown) => void;
  onClose: (why: string) => void;
}
