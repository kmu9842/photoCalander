import { useLayoutEffect, useRef } from 'react';
import { Fragment, Slice } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { baseKeymap } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import 'prosemirror-view/style/prosemirror.css';
import { memoDocument, memoSchema, readMemo, toggleLineStrike, type MemoValue } from './memo';
import { memoChecklist } from './memo-checklist';

export function MemoEditor({ value, autoFocus = true, onChange }: { value: MemoValue; autoFocus?: boolean; onChange(value: MemoValue): void }) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange });
  callbacks.current = { onChange };
  const lastValue = useRef(value);

  useLayoutEffect(() => {
    if (!host.current) return;
    const view = new EditorView(host.current, {
      state: EditorState.create({
        doc: memoDocument(lastValue.current),
        plugins: [history(), memoChecklist, keymap({
          'Mod-5': toggleLineStrike,
          'Mod-Shift-x': toggleLineStrike,
          'Mod-z': undo, 'Mod-y': redo, 'Mod-Shift-z': redo,
          'Enter': (state, dispatch, view) => baseKeymap.Enter(state, dispatch && (tr => dispatch(tr.removeStoredMark(memoSchema.marks.strike))), view),
          'Shift-Enter': (state, dispatch) => { dispatch?.(state.tr.replaceSelectionWith(memoSchema.nodes.hard_break.create(), false).ensureMarks((state.storedMarks || state.selection.$from.marks()).filter(mark => mark.type !== memoSchema.marks.strike)).scrollIntoView()); return true; },
          'Mod-b': () => true, 'Mod-i': () => true, 'Mod-u': () => true,
        }), keymap(baseKeymap)],
      }),
      attributes: { class: 'memo-editor', role: 'textbox', 'aria-label': '메모 내용', 'aria-multiline': 'true', 'data-placeholder': '메모', spellcheck: 'false' },
      dispatchTransaction(transaction) {
        const state = view.state.apply(transaction);
        view.updateState(state);
        if (transaction.docChanged) {
          lastValue.current = readMemo(state.doc);
          callbacks.current.onChange(lastValue.current);
        }
      },
      clipboardTextParser(text) {
        const paragraphs = text.replace(/\r\n?/g, '\n').split('\n').map(line => memoSchema.nodes.paragraph.create(null, line ? memoSchema.text(line) : undefined));
        return new Slice(Fragment.fromArray(paragraphs), 1, 1);
      },
      clipboardTextSerializer: slice => slice.content.textBetween(0, slice.content.size, '\n', node => node.type === memoSchema.nodes.hard_break ? '\n' : ''),
      handleDOMEvents: {
        // Leave photo input to the calendar's clipboard/drop handlers.
        paste: (_view, event) => !!event.clipboardData?.files.length || !event.clipboardData?.getData('text/plain'),
        drop: (_view, event) => !!event.dataTransfer?.files.length,
      },
    });
    viewRef.current = view;
    return () => { viewRef.current = null; view.destroy(); };
  }, []);

  useLayoutEffect(() => { if (autoFocus) viewRef.current?.focus(); }, [autoFocus]);

  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view || (value.text === lastValue.current.text && JSON.stringify(value.strikes) === JSON.stringify(lastValue.current.strikes) && JSON.stringify(value.textColors) === JSON.stringify(lastValue.current.textColors) && JSON.stringify(value.textSizes) === JSON.stringify(lastValue.current.textSizes))) return;
    lastValue.current = value;
    const doc = memoDocument(value);
    if (!view.state.doc.eq(doc)) view.updateState(EditorState.create({ doc, plugins: view.state.plugins }));
  }, [value.text, value.strikes, value.textColors, value.textSizes]);

  return <div className="memo-host" ref={host} />;
}
