import { describe, expect, it } from 'vitest';
import { memoLines } from '../src/memo-checklist';
import { memoDocument, memoSchema, readMemo } from '../src/memo';

describe('memo completion lines', () => {
  it('maps existing completion ranges and keeps soft breaks separate from wrapped lines', () => {
    const value = { text: '첫 줄\n완료한 줄\n아주 긴 셋째 줄', strikes: [{ from: 4, to: 9 }] };
    const doc = memoDocument(value);
    expect(memoLines(doc).map(line => line.complete)).toEqual([false, true, false]);
    expect(readMemo(doc)).toEqual(value);
    const mark = memoSchema.marks.strike.create();
    const softBreaks = memoSchema.nodes.doc.create(null, memoSchema.nodes.paragraph.create(null, [memoSchema.text('완료', [mark]), memoSchema.nodes.hard_break.create(), memoSchema.text('아직')]));
    expect(memoLines(softBreaks)).toEqual([{ from: 1, to: 3, complete: true }, { from: 4, to: 6, complete: false }]);
    expect(readMemo(softBreaks)).toEqual({ text: '완료\n아직', strikes: [{ from: 0, to: 2 }] });
  });
});
