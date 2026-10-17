import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node as EditorNode } from 'prosemirror-model';
import { memoSchema } from './memo';

export function memoLines(doc: EditorNode) {
  const lines: { from: number; to: number; complete: boolean }[] = [];
  const append = (from: number, to: number) => {
    let hasText = false, complete = true;
    doc.nodesBetween(from, to, node => {
      if (node.isText) { hasText = true; complete &&= !!memoSchema.marks.strike.isInSet(node.marks); }
    });
    lines.push({ from, to, complete: hasText && complete });
  };
  doc.forEach((paragraph, offset) => {
    let from = offset + 1;
    paragraph.forEach((node, innerOffset) => {
      if (node.type === memoSchema.nodes.hard_break) {
        append(from, offset + 1 + innerOffset);
        from = offset + 2 + innerOffset;
      }
    });
    append(from, offset + 1 + paragraph.content.size);
  });
  return lines;
}

// Widgets stay outside the document, so copy/paste, backups and undo keep plain memo text.
export const memoChecklist = new Plugin({
  props: {
    decorations(state) {
      return DecorationSet.create(state.doc, memoLines(state.doc).map(({ from, to, complete }, index) => Decoration.widget(from, view => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'memo-line-check';
        button.setAttribute('role', 'checkbox');
        button.setAttribute('aria-label', `${index + 1}번째 줄 완료`);
        button.setAttribute('aria-checked', String(complete));
        button.title = `${index + 1}번째 줄 ${complete ? '완료 해제' : '완료'}`;
        button.contentEditable = 'false';
        button.disabled = from === to;
        button.addEventListener('mousedown', event => event.preventDefault());
        button.addEventListener('click', event => {
          event.preventDefault(); event.stopPropagation();
          const tr = view.state.tr, mark = memoSchema.marks.strike;
          view.dispatch(complete ? tr.removeMark(from, to, mark).removeStoredMark(mark) : tr.addMark(from, to, mark.create()));
          view.focus();
        });
        return button;
      }, { side: -1, key: `${index}:${from}:${to}:${complete}`, stopEvent: () => true, ignoreSelection: true })));
    },
  },
});
