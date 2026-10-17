import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { toggleMark } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';
import { memoDocument, memoSchema, readMemo } from './memo';

describe('memo formatting', () => {
  it('strikes selected Korean text with marks without inserting characters, and supports undo/redo', () => {
    const original = '오전 회의 자료 준비';
    let state = EditorState.create({ doc: memoDocument({ text: original, strikes: [] }), plugins: [history()] });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 4, 6)));
    const dispatch = (transaction: Parameters<typeof state.apply>[0]) => { state = state.apply(transaction); };
    toggleMark(memoSchema.marks.strike)(state, dispatch);
    expect(readMemo(state.doc)).toEqual({ text: original, strikes: [{ from: 3, to: 5 }] });
    undo(state, dispatch);
    expect(readMemo(state.doc)).toEqual({ text: original, strikes: [] });
    redo(state, dispatch);
    expect(readMemo(state.doc).strikes).toEqual([{ from: 3, to: 5 }]);
    toggleMark(memoSchema.marks.strike)(state, dispatch);
    expect(readMemo(state.doc)).toEqual({ text: original, strikes: [] });
  });
  it('preserves paragraphs, blank lines, emoji, spaces, and literal tildes', () => {
    const text = '첫 줄  🙂\n\n둘째 줄 ~~문자~~\n';
    const value = { text, strikes: [{ from: 0, to: 3 }, { from: 11, to: 14 }] };
    expect(readMemo(memoDocument(value))).toEqual(value);
  });
  it('supports strike formatting across paragraphs', () => {
    const text = '첫 줄\n\n다음 줄';
    let state = EditorState.create({ doc: memoDocument({ text, strikes: [] }) });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, state.doc.content.size - 1)));
    toggleMark(memoSchema.marks.strike)(state, tr => { state = state.apply(tr); });
    const memo = readMemo(state.doc);
    expect(memo.text).toBe(text);
    expect(memo.strikes.map(range => memo.text.slice(range.from, range.to))).toEqual(['첫 줄', '다음 줄']);
    expect(readMemo(memoDocument(memo))).toEqual(memo);
  });
});
