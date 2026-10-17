import { Schema, type Node as EditorNode } from 'prosemirror-model';
import type { StrikeRange } from './types';

export interface MemoValue { text: string; strikes: StrikeRange[] }

export const memoSchema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'inline*', group: 'block', parseDOM: [{ tag: 'p' }, { tag: 'div' }], toDOM: () => ['p', 0] },
    text: { group: 'inline' },
    hard_break: { inline: true, group: 'inline', selectable: false, parseDOM: [{ tag: 'br' }], toDOM: () => ['br'] },
  },
  marks: {
    strike: { parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }, { style: 'text-decoration', getAttrs: value => String(value).includes('line-through') ? null : false }], toDOM: () => ['s', 0] },
  },
});

export function memoDocument(value: MemoValue): EditorNode {
  let offset = 0, rangeIndex = 0;
  const paragraphs = value.text.split('\n').map(line => {
    const nodes: EditorNode[] = [];
    let cursor = 0;
    while (rangeIndex < value.strikes.length && value.strikes[rangeIndex].to <= offset) rangeIndex++;
    for (let i = rangeIndex; i < value.strikes.length; i++) {
      const range = value.strikes[i];
      if (range.from >= offset + line.length) break;
      const from = Math.max(0, range.from - offset), to = Math.min(line.length, range.to - offset);
      if (from >= to) continue;
      if (from > cursor) nodes.push(memoSchema.text(line.slice(cursor, from)));
      nodes.push(memoSchema.text(line.slice(from, to), [memoSchema.marks.strike.create()]));
      cursor = to;
    }
    if (cursor < line.length) nodes.push(memoSchema.text(line.slice(cursor)));
    offset += line.length + 1;
    return memoSchema.nodes.paragraph.create(null, nodes);
  });
  return memoSchema.nodes.doc.create(null, paragraphs);
}

export function readMemo(doc: EditorNode): MemoValue {
  let text = '';
  const strikes: StrikeRange[] = [];
  doc.forEach((paragraph, _offset, index) => {
    if (index) text += '\n';
    paragraph.forEach(node => {
      const value = node.isText ? node.text! : '\n';
      const from = text.length;
      text += value;
      if (node.marks.some(mark => mark.type === memoSchema.marks.strike)) {
        const previous = strikes.at(-1);
        if (previous?.to === from) previous.to = text.length;
        else strikes.push({ from, to: text.length });
      }
    });
  });
  return { text, strikes };
}
