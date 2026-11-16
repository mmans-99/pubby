/**
 * Pop-up wording that depends on whose phone it is. Pure: no DOM, so it is tested
 * without a browser (tests/ui/popuptext.test.ts).
 */

/**
 * 9al.4 (2.37.1): the forfeit line in a pop-up. On the phone whose player forfeited it
 * reads "You forfeited"; every other phone (and a one-phone game) keeps the name.
 */
export function forfeitLine(name: string, isMe: boolean): string {
  return `${isMe ? 'You' : name} forfeited`;
}
