import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { toggleMark } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';
import { currentLineStruck, memoDocument, memoSchema, readMemo, selectedTextSize, setTextSize, toggleLineStrike } from './memo';

describe('memo formatting', () => {
  it('changes only selected character sizes while retaining colors, strikes and undo history', () => {
    const value = { text: '앞 중요 뒤\n다음 줄', strikes: [{ from: 2, to: 4 }], textColors: [{ from: 0, to: 6, color: '#ff9595' as const }] };
    let state = EditorState.create({ doc: memoDocument(value), plugins: [history()] });
    const dispatch = (tr: Parameters<typeof state.apply>[0]) => { state = state.apply(tr); };
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, 3, 5)));
    setTextSize(24)(state, dispatch);
    expect(readMemo(state.doc)).toEqual({ ...value, textSizes: [{ from: 2, to: 4, size: 24 }] });
    expect(readMemo(memoDocument(readMemo(state.doc)))).toEqual(readMemo(state.doc));
    expect(selectedTextSize(state, 13)).toBe(24);
    undo(state, dispatch);
    expect(readMemo(state.doc)).toEqual(value);
    redo(state, dispatch);
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, 1, 7)));
    expect(selectedTextSize(state, 13)).toBeNull();
    setTextSize(null)(state, dispatch);
    expect(readMemo(state.doc)).toEqual(value);
  });
  it('applies a chosen size to new typing and updates ranges when earlier text is inserted', () => {
    let state = EditorState.create({ doc: memoDocument({ text: '앞 ', strikes: [] }) });
    const dispatch = (tr: Parameters<typeof state.apply>[0]) => { state = state.apply(tr); };
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, 3)));
    setTextSize(32)(state, dispatch);
    dispatch(state.tr.insertText('🙂'));
    expect(readMemo(state.doc).textSizes).toEqual([{ from: 2, to: 4, size: 32 }]);
    dispatch(state.tr.insertText('추가 ', 1));
    expect(readMemo(state.doc).textSizes).toEqual([{ from: 5, to: 7, size: 32 }]);
    expect(setTextSize(49)(state, dispatch)).toBe(false);
  });
  it('toggles only the line at the cursor even when a selection spans several lines', () => {
    let state = EditorState.create({ doc: memoDocument({ text: '첫 줄\n둘째 줄\n셋째 줄', strikes: [{ from: 4, to: 6 }] }), plugins: [history()] });
    const dispatch = (tr: Parameters<typeof state.apply>[0]) => { state = state.apply(tr); };
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, 1, 8)));
    expect(currentLineStruck(state)).toBe(false);
    toggleLineStrike(state, dispatch);
    expect(readMemo(state.doc).strikes).toEqual([{ from: 4, to: 8 }]);
    expect(currentLineStruck(state)).toBe(true);
    toggleLineStrike(state, dispatch);
    expect(readMemo(state.doc).strikes).toEqual([]);
    expect(readMemo(state.doc).text).toBe('첫 줄\n둘째 줄\n셋째 줄');
  });
  it('treats Shift+Enter as a line boundary and can toggle an empty line without touching its neighbors', () => {
    const paragraph = memoSchema.nodes.paragraph.create(null, [memoSchema.text('앞'), memoSchema.nodes.hard_break.create(), memoSchema.text('뒤')]);
    let state = EditorState.create({ doc: memoSchema.nodes.doc.create(null, [paragraph, memoSchema.nodes.paragraph.create()]) });
    const dispatch = (tr: Parameters<typeof state.apply>[0]) => { state = state.apply(tr); };
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, 3)));
    toggleLineStrike(state, dispatch);
    expect(readMemo(state.doc).strikes).toEqual([{ from: 2, to: 3 }]);
    dispatch(state.tr.setSelection(TextSelection.atEnd(state.doc)));
    toggleLineStrike(state, dispatch);
    dispatch(state.tr.insertText('새 줄'));
    expect(readMemo(state.doc)).toEqual({ text: '앞\n뒤\n새 줄', strikes: [{ from: 2, to: 3 }, { from: 4, to: 7 }] });
  });
  it('preserves imported Excel text colors when editing and toggling strikes', () => {
    const value = { text: '빨간 메모\n완료', strikes: [{ from: 6, to: 8 }], textColors: [{ from: 0, to: 5, color: '#ff9595' as const }] };
    let state = EditorState.create({ doc: memoDocument(value) });
    expect(readMemo(state.doc)).toEqual(value);
    state = state.apply(state.tr.insertText('추가 ', 1));
    const updated = readMemo(state.doc);
    expect(updated.textColors).toEqual([{ from: 0, to: 8, color: '#ff9595' }]);
    expect(updated.strikes).toEqual([{ from: 9, to: 11 }]);
  });
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
