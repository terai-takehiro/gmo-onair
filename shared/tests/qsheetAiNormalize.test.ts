/**
 * 制作資料 v4 の AI 生成（段8）— `normalize.ts` の純関数を固定する。
 *
 * server は `shared/` を import しない構成なので、**server のファイルを相対 import**する
 * （`nextActionShort.test.ts` / `qsheetAiRoundTrip.test.ts` と同じやり方）。
 *
 * ここで固定したいこと（04-ai.md §2-4・§2-5・§2-6）:
 * - **AI に埋めさせるのはシナリオだけ**。②骨格は本文を持たない・尺は budget_sec を超えない
 * - **③セリフは既存の行 id にしか書かない**。幻覚した id・重複・空文字は「捨てる」
 * - **AI に HTML を書かせない**。混ざっていたら剥がす（捨てるのではなく剥がす）
 * - **捨てたものは記録できる形で返す**（`dropped`）
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  normalizeEventPlan, normalizeScriptOutline, normalizeScriptLines,
} from '../../server/src/contexts/qsheet/ai/normalize';

describe('normalizeEventPlan — ①枠', () => {
  it('既存列 or 提案内の列を指す項目だけを採る', () => {
    const { plan, dropped } = normalizeEventPlan(
      {
        columns: [{ key: 'c1', col_group: 'venue', label: 'メインホール', room_hint: '' }],
        items: [
          { key: 'i1', column_ref: 'c1', title: '搬入', kind: 'setup', start_min: 480, end_min: 540, assignee: '', note: '', reason: '' },
          { key: 'i2', column_ref: 'existing-col', title: 'リハ', kind: 'rehearsal', start_min: 540, end_min: 600, assignee: '', note: '', reason: '' },
          { key: 'i3', column_ref: 'no-such-column', title: '幻の項目', kind: 'other', start_min: 0, end_min: 30, assignee: '', note: '', reason: '' },
        ],
      },
      { existingColumnIds: new Set(['existing-col']) },
    );
    expect(plan.items.map((i) => i.key)).toEqual(['i1', 'i2']);
    expect(dropped).toEqual([{ reason: 'bad_reference', path: 'items[2]', value: expect.objectContaining({ key: 'i3' }) }]);
  });

  it('日跨ぎ上限を超える・終了が開始以前の項目は落とす', () => {
    const { plan, dropped } = normalizeEventPlan(
      {
        columns: [],
        items: [
          { key: 'ok', column_ref: 'c', title: '正常', kind: 'other', start_min: 100, end_min: 200, assignee: '', note: '', reason: '' },
          { key: 'over', column_ref: 'c', title: '超過', kind: 'other', start_min: 100, end_min: 2900, assignee: '', note: '', reason: '' },
          { key: 'inverted', column_ref: 'c', title: '逆転', kind: 'other', start_min: 200, end_min: 100, assignee: '', note: '', reason: '' },
        ],
      },
      { existingColumnIds: new Set(['c']) },
    );
    expect(plan.items.map((i) => i.key)).toEqual(['ok']);
    expect(dropped.map((d) => d.reason)).toEqual(['bad_time_range', 'bad_time_range']);
  });

  it('空文字は null に落とす（「不明」と「決めた」を区別する）', () => {
    const { plan } = normalizeEventPlan(
      { columns: [], items: [{ key: 'i', column_ref: 'c', title: 't', kind: 'other', start_min: 0, end_min: 10, assignee: '', note: '', reason: '' }] },
      { existingColumnIds: new Set(['c']) },
    );
    expect(plan.items[0].assignee).toBeNull();
    expect(plan.items[0].note).toBeNull();
  });
});

describe('normalizeScriptOutline — ②骨格', () => {
  it('尺の制約: budget_sec を超える骨格は末尾のロールから落とす', () => {
    const { plan, dropped } = normalizeScriptOutline(
      {
        sections: [
          { key: 's1', label: 'オープニング', duration_sec: 300, rows: [] },
          { key: 's2', label: '本編', duration_sec: 600, rows: [] },
          { key: 's3', label: 'エンディング', duration_sec: 300, rows: [] },
        ],
      },
      1000, // 合計 1200 のうち 1000 に収まるまで末尾から落とす
    );
    expect(plan.sections.map((s) => s.key)).toEqual(['s1', 's2']);
    expect(plan.sections.reduce((a, s) => a + s.duration_sec, 0)).toBeLessThanOrEqual(1000);
    expect(dropped).toEqual([{ reason: 'budget_exceeded', path: 'sections[s3]', value: expect.objectContaining({ key: 's3' }) }]);
  });

  it('本文（html）を持たない — hint はタグを剥がすだけで本文にはならない', () => {
    const { plan } = normalizeScriptOutline(
      { sections: [{ key: 's', label: 'ロール', duration_sec: 60, rows: [{ key: 'r', label: '行', duration_sec: 30, speaker: '', hint: '<b>強調</b>のメモ' }] }] },
      null,
    );
    const row = plan.sections[0].rows[0];
    expect(row.hint).toBe('強調のメモ');
    expect('html' in row).toBe(false); // ScriptOutlineProposalRow に html フィールドが無いこと自体を保証
  });

  it('budget_sec が無ければ（null）尺で落とさない', () => {
    const { plan, dropped } = normalizeScriptOutline(
      { sections: [{ key: 's1', label: 'ロール', duration_sec: 999_999, rows: [] }] }, null,
    );
    expect(plan.sections).toHaveLength(1);
    expect(dropped).toHaveLength(0);
  });

  it('重複した key は2件目以降を落とす', () => {
    const { plan, dropped } = normalizeScriptOutline(
      { sections: [{ key: 's1', label: 'A', duration_sec: 10, rows: [] }, { key: 's1', label: 'B', duration_sec: 10, rows: [] }] }, null,
    );
    expect(plan.sections).toHaveLength(1);
    expect(plan.sections[0].label).toBe('A');
    expect(dropped[0].reason).toBe('duplicate_key');
  });
});

describe('normalizeScriptLines — ③セリフ（行を増やさない・幻覚を捨てる）', () => {
  const allowedRowIds = new Set(['row_1', 'row_2']);

  it('渡された行 id 以外（幻覚）は捨てる。行は増えない', () => {
    const { plan, dropped } = normalizeScriptLines(
      { lines: [{ row_id: 'row_1', name: '', text: 'こんにちは', is_q_word: false }, { row_id: 'row_999', name: '', text: '幻覚した行', is_q_word: false }] },
      allowedRowIds,
    );
    expect(plan.lines.map((l) => l.row_id)).toEqual(['row_1']);
    expect(dropped).toEqual([{ reason: 'bad_reference', path: 'rows[1]', value: expect.objectContaining({ row_id: 'row_999' }) }]);
  });

  it('AI に HTML を書かせない — タグは剥がすが文章は残す（捨てない）', () => {
    const { plan } = normalizeScriptLines(
      { lines: [{ row_id: 'row_1', name: '', text: '<b>本日は</b>お越しいただき<br>ありがとうございます', is_q_word: false }] },
      allowedRowIds,
    );
    expect(plan.lines[0].text).toBe('本日はお越しいただきありがとうございます');
    expect(plan.lines[0].text).not.toMatch(/[<>]/);
  });

  it('同じ行 id が2回来たら2件目を重複として捨てる', () => {
    const { plan, dropped } = normalizeScriptLines(
      { lines: [{ row_id: 'row_1', name: '', text: '1回目', is_q_word: false }, { row_id: 'row_1', name: '', text: '2回目', is_q_word: false }] },
      allowedRowIds,
    );
    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0].text).toBe('1回目');
    expect(dropped[0].reason).toBe('duplicate_row');
  });

  it('空文字だけの本文は捨てる（タグを剥がした結果が空でも同様）', () => {
    const { plan, dropped } = normalizeScriptLines(
      { lines: [{ row_id: 'row_1', name: '', text: '<b></b>', is_q_word: false }] }, allowedRowIds,
    );
    expect(plan.lines).toHaveLength(0);
    expect(dropped[0].reason).toBe('empty_text');
  });

  it('masters.persons に無い話者名は勝手に人物を作らず空にする', () => {
    const { plan } = normalizeScriptLines(
      { lines: [{ row_id: 'row_1', name: '知らない人', text: '本文', is_q_word: false }] },
      allowedRowIds, new Set(['司会']),
    );
    expect(plan.lines[0].name).toBe('');
  });

  it('advice は空文字を捨てて最大10件に絞る（行を増やす代わりに人に判断させる）', () => {
    const { plan } = normalizeScriptLines(
      { lines: [], advice: ['', ...Array.from({ length: 15 }, (_, i) => `助言${i}`)] }, allowedRowIds,
    );
    expect(plan.advice).toHaveLength(10);
    expect(plan.advice.every((a) => a !== '')).toBe(true);
  });
});

/** コメント（説明文の中の言及）を取り除いた実コードだけを見る（`aiModel.test.ts` と同じやり方） */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('emphasis は第1版のスキーマから落としてある（04-ai.md §2-5 の訂正）', () => {
  it('schemas.ts の ScriptLineSchema に emphasis フィールドを持たない', () => {
    const schemaSrc = readFileSync(
      join(__dirname, '..', '..', 'server', 'src', 'contexts', 'qsheet', 'ai', 'schemas.ts'), 'utf8',
    );
    expect(codeOnly(schemaSrc)).not.toMatch(/emphasis/);
  });
});

describe('schemas.ts は .optional() / .nullable() / .default() を使わない（04-ai.md §2-5）', () => {
  it('strict structured outputs 対応（既存5サービスと同じ作法）', () => {
    const src = codeOnly(readFileSync(
      join(__dirname, '..', '..', 'server', 'src', 'contexts', 'qsheet', 'ai', 'schemas.ts'), 'utf8',
    ));
    expect(src).not.toMatch(/\.optional\(\)/);
    expect(src).not.toMatch(/\.nullable\(\)/);
    expect(src).not.toMatch(/\.default\(/);
  });
});
