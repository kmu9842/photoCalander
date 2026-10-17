import { Schema, type Node as EditorNode } from 'prosemirror-model';
import type { StrikeRange, TextColorRange } from './types';

export interface MemoValue { text: string; strikes: StrikeRange[]; textColors?: TextColorRange[] }

export const memoSchema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'inline*', group: 'block', parseDOM: [{ tag: 'p' }, { tag: 'div' }], toDOM: () => ['p', 0] },
    text: { group: 'inline' },
    hard_break: { inline: true, group: 'inline', selectable: false, parseDOM: [{ tag: 'br' }], toDOM: () => ['br'] },
  },
  marks: {
    strike: { parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }, { style: 'text-decoration', getAttrs: value => String(value).includes('line-through') ? null : false }], toDOM: () => ['s', 0] },
    color: { attrs: { color: {} }, toDOM: mark => ['span', { style: `color:${mark.attrs.color}` }, 0] },
  },
});

export function memoDocument(value: MemoValue): EditorNode {
  let offset = 0;
  const paragraphs = value.text.split('\n').map(line => {
    const nodes: EditorNode[] = [];
    const ranges = [...value.strikes, ...(value.textColors || [])].filter(range => range.to > offset && range.from < offset + line.length);
    const boundaries = [...new Set([0, line.length, ...ranges.flatMap(range => [Math.max(0, range.from - offset), Math.min(line.length, range.to - offset)])])].sort((a, b) => a - b);
    for (let i = 0; i < boundaries.length - 1; i++) {
      const from = boundaries[i], to = boundaries[i + 1], marks = [];
      if (value.strikes.some(range => range.from <= offset + from && range.to > offset + from)) marks.push(memoSchema.marks.strike.create());
      const color = value.textColors?.find(range => range.from <= offset + from && range.to > offset + from);
      if (color) marks.push(memoSchema.marks.color.create({ color: color.color }));
      nodes.push(memoSchema.text(line.slice(from, to), marks));
    }
    offset += line.length + 1;
    return memoSchema.nodes.paragraph.create(null, nodes);
  });
  return memoSchema.nodes.doc.create(null, paragraphs);
}

export function readMemo(doc: EditorNode): MemoValue {
  let text = '';
  const strikes: StrikeRange[] = [];
  const textColors: TextColorRange[] = [];
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
      const color = node.marks.find(mark => mark.type === memoSchema.marks.color)?.attrs.color;
      if (color) {
        const previous = textColors.at(-1);
        if (previous?.to === from && previous.color === color) previous.to = text.length;
        else textColors.push({ from, to: text.length, color });
      }
    });
  });
  return { text, strikes, ...(textColors.length ? { textColors } : {}) };
}
