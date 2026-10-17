import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { Fragment, Slice } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import 'prosemirror-view/style/prosemirror.css';
import { memoDocument, memoSchema, readMemo, type MemoValue } from './memo';

export interface MemoHandle { toggleStrike(): void }

export const MemoEditor = forwardRef<MemoHandle, { value: MemoValue; onChange(value: MemoValue): void; onStrikeChange(active: boolean): void }>(function MemoEditor({ value, onChange, onStrikeChange }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onStrikeChange });
  callbacks.current = { onChange, onStrikeChange };
  const lastValue = useRef(value);

  useImperativeHandle(ref, () => ({ toggleStrike() {
    const view = viewRef.current;
    if (!view) return;
    toggleMark(memoSchema.marks.strike)(view.state, view.dispatch);
    view.focus();
  } }), []);

  useLayoutEffect(() => {
    if (!host.current) return;
    const view = new EditorView(host.current, {
      state: EditorState.create({
        doc: memoDocument(lastValue.current),
        plugins: [history(), keymap({
          'Mod-Shift-x': toggleMark(memoSchema.marks.strike),
          'Mod-z': undo, 'Mod-y': redo, 'Mod-Shift-z': redo,
          'Shift-Enter': (state, dispatch) => { dispatch?.(state.tr.replaceSelectionWith(memoSchema.nodes.hard_break.create()).scrollIntoView()); return true; },
          'Mod-b': () => true, 'Mod-i': () => true, 'Mod-u': () => true,
        }), keymap(baseKeymap)],
      }),
      attributes: { class: 'memo-editor', role: 'textbox', 'aria-label': '메모 내용', 'aria-multiline': 'true', 'data-placeholder': '메모', spellcheck: 'false' },
      dispatchTransaction(transaction) {
        const state = view.state.apply(transaction);
        view.updateState(state);
        const { from, to, empty, $from } = state.selection;
        callbacks.current.onStrikeChange(empty ? !!memoSchema.marks.strike.isInSet(state.storedMarks || $from.marks()) : state.doc.rangeHasMark(from, to, memoSchema.marks.strike));
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
    view.focus();
    callbacks.current.onStrikeChange(!!memoSchema.marks.strike.isInSet(view.state.selection.$from.marks()));
    return () => { viewRef.current = null; view.destroy(); };
  }, []);

  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view || (value.text === lastValue.current.text && JSON.stringify(value.strikes) === JSON.stringify(lastValue.current.strikes) && JSON.stringify(value.textColors) === JSON.stringify(lastValue.current.textColors))) return;
    lastValue.current = value;
    const doc = memoDocument(value);
    if (!view.state.doc.eq(doc)) view.updateState(EditorState.create({ doc, plugins: view.state.plugins }));
  }, [value.text, value.strikes, value.textColors]);

  return <div className="memo-host" ref={host} />;
});
