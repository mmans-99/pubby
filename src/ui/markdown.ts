/**
 * Turns the small markdown files in src/content/ into DOM nodes.
 * Supports what those files use: headings (#, ##), paragraphs, "- " lists,
 * **bold** and `code`. Text is never inserted as HTML, so it is always safe.
 */

import { h, type Child } from './dom.ts';

function inline(text: string): Child[] {
  const out: Child[] = [];
  const re = /\*\*(.+?)\*\*|`(.+?)`/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] !== undefined ? h('strong', null, m[1]) : h('code', null, m[2] ?? ''));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Render markdown. `skipIntro` drops everything before the first "## "
 * heading (the file title and the note for developers).
 */
export function renderMarkdown(md: string, skipIntro = false): HTMLElement {
  let lines = md.replace(/\r/g, '').split('\n');
  if (skipIntro) {
    const first = lines.findIndex((l) => l.startsWith('## '));
    if (first > 0) lines = lines.slice(first);
  }
  const root = h('div', { class: 'md' });
  let para: string[] = [];
  let list: HTMLUListElement | null = null;
  const flush = (): void => {
    if (para.length) root.appendChild(h('p', null, inline(para.join(' '))));
    para = [];
    list = null;
  };
  for (const line of lines) {
    const t = line.trim();
    if (!t) { flush(); continue; }
    if (t.startsWith('## ')) { flush(); root.appendChild(h('h3', null, inline(t.slice(3)))); continue; }
    if (t.startsWith('# ')) { flush(); root.appendChild(h('h2', null, inline(t.slice(2)))); continue; }
    if (t.startsWith('- ')) {
      if (para.length) { root.appendChild(h('p', null, inline(para.join(' ')))); para = []; }
      if (!list) { list = h('ul'); root.appendChild(list); }
      list.appendChild(h('li', null, inline(t.slice(2))));
      continue;
    }
    list = null;
    para.push(t);
  }
  flush();
  return root;
}
