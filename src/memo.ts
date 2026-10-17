import { Schema, type Node as EditorNode } from 'prosemirror-model';
import type { Command, EditorState } from 'prosemirror-state';
import type { StrikeRange, TextColorRange, TextSizeRange } from './types';

export interface MemoValue { text: string; strikes: StrikeRange[]; textColors?: TextColorRange[]; textSizes?: TextSizeRange[] }

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
    size: { attrs: { size: {} }, toDOM: mark => ['span', { style: `font-size:${mark.attrs.size}px` }, 0] },
  },
});

export function memoDocument(value: MemoValue): EditorNode {
  let offset = 0;
  const paragraphs = value.text.split('\n').map(line => {
    const nodes: EditorNode[] = [];
    const ranges = [...value.strikes, ...(value.textColors || []), ...(value.textSizes || [])].filter(range => range.to > offset && range.from < offset + line.length);
    const boundaries = [...new Set([0, line.length, ...ranges.flatMap(range => [Math.max(0, range.from - offset), Math.min(line.length, range.to - offset)])])].sort((a, b) => a - b);
    for (let i = 0; i < boundaries.length - 1; i++) {
      const from = boundaries[i], to = boundaries[i + 1], marks = [];
      if (value.strikes.some(range => range.from <= offset + from && range.to > offset + from)) marks.push(memoSchema.marks.strike.create());
      const color = value.textColors?.find(range => range.from <= offset + from && range.to > offset + from);
      if (color) marks.push(memoSchema.marks.color.create({ color: color.color }));
      const size = value.textSizes?.find(range => range.from <= offset + from && range.to > offset + from)?.size;
      if (size !== undefined) marks.push(memoSchema.marks.size.create({ size }));
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
  const textSizes: TextSizeRange[] = [];
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
      const size = node.marks.find(mark => mark.type === memoSchema.marks.size)?.attrs.size;
      if (size !== undefined) {
        const previous = textSizes.at(-1);
        if (previous?.to === from && previous.size === size) previous.to = text.length;
        else textSizes.push({ from, to: text.length, size });
      }
    });
  });
  return { text, strikes, ...(textColors.length ? { textColors } : {}), ...(textSizes.length ? { textSizes } : {}) };
}

// A line ends at Enter or Shift+Enter, independently of visual wrapping.
export function currentLine(state: EditorState) {
  const { $head } = state.selection;
  const start = $head.start();
  let from = start, to = start + $head.parent.content.size;
  $head.parent.forEach((node, offset) => {
    if (node.type !== memoSchema.nodes.hard_break) return;
    if (offset < $head.parentOffset) from = start + offset + 1;
    else to = Math.min(to, start + offset);
  });
  return { from, to };
}

export function currentLineStruck(state: EditorState): boolean {
  const { from, to } = currentLine(state);
  if (from === to) return !!memoSchema.marks.strike.isInSet(state.storedMarks || state.selection.$head.marks());
  let hasText = false, allStruck = true;
  state.doc.nodesBetween(from, to, node => {
    if (node.isText) { hasText = true; allStruck &&= !!memoSchema.marks.strike.isInSet(node.marks); }
  });
  return hasText && allStruck;
}

export const toggleLineStrike: Command = (state, dispatch) => {
  const { from, to } = currentLine(state);
  const mark = memoSchema.marks.strike;
  const struck = currentLineStruck(state);
  const tr = state.tr;
  if (from === to) {
    if (struck) tr.removeStoredMark(mark);
    else tr.addStoredMark(mark.create());
  } else if (struck) tr.removeMark(from, to, mark).removeStoredMark(mark);
  else tr.addMark(from, to, mark.create());
  dispatch?.(tr);
  return true;
};

export const setTextSize = (size: number | null): Command => (state, dispatch) => {
  if (size !== null && (!Number.isInteger(size) || size < 8 || size > 48)) return false;
  const mark = memoSchema.marks.size;
  const { from, to, empty } = state.selection;
  const tr = state.tr;
  if (empty) {
    if (size === null) tr.removeStoredMark(mark);
    else tr.addStoredMark(mark.create({ size }));
  } else if (size === null) tr.removeMark(from, to, mark);
  else tr.addMark(from, to, mark.create({ size }));
  dispatch?.(tr);
  return true;
};

export function selectedTextSize(state: EditorState, defaultSize: number): number | null {
  const { from, to, empty, $head } = state.selection;
  if (empty) return memoSchema.marks.size.isInSet(state.storedMarks || $head.marks())?.attrs.size ?? defaultSize;
  const sizes = new Set<number>();
  state.doc.nodesBetween(from, to, node => {
    if (node.isText) sizes.add(memoSchema.marks.size.isInSet(node.marks)?.attrs.size ?? defaultSize);
  });
  return sizes.size > 1 ? null : sizes.values().next().value ?? defaultSize;
}
