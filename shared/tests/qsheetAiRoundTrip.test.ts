/**
 * 段7「AI 提案の受け止め」— 往復テスト（07-ai-proposals-impl.md §8）。
 *
 * ⚠️ **「取り込む → 何も触らない → 締める ⇒ `none` 1行だけ」が壊れると全指標が同時に嘘になる。**
 * サーバー側の試験は1本も無く、DB を立てる仕組みも無いため（§2-7・§8-1）、
 * **判断する部分（純関数）だけをここで固定する**。DB 込みの往復は検証環境で手動確認する。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sanitizeApplied } from '../../server/src/contexts/qsheet/ai/apply.core';
import { computeSettleCorrections, computeEarlyDueAt, computeFinalDueInfo } from '../../server/src/contexts/qsheet/ai/settle.core';
import { toComparableRow } from '../../server/src/contexts/qsheet/ai/comparable';
import { parseDur as parseDurServer } from '../../server/src/shared/schedule/time';
import { parseDur as parseDurClient } from '../../client-techops/src/lib/time';
import { applyProposalOps } from '../../client-techops/src/lib/applyProposal';
import type { AppliedIds, AppliedPayload } from '../../server/src/contexts/qsheet/ai/types';

const SCENARIO_BLOCK_ID = 'scenario';

function emptyIds(): AppliedIds {
  return { sections: [], rows: [], items: [], columns: [] };
}

/** script_line_draft の提案1本。row_1 / row_2 は既存行として prev に存在する */
function linesProposal() {
  return {
    lines: [
      { row_id: 'row_1', name: 'アナ', text: 'おはようございます', is_q_word: false },
      { row_id: 'row_2', name: 'MC', text: 'よろしくお願いします', is_q_word: false },
    ],
  };
}

function prevDoc() {
  return {
    blocks: [{ id: SCENARIO_BLOCK_ID, type: 'scenario', label: '台本' }],
    sections: [
      {
        id: 'sec_1', label: 'OP', duration: '1:00',
        rows: [
          { id: 'row_1', label: '', duration: '0:30', cells: {} },
          { id: 'row_2', label: '', duration: '0:20', cells: {} },
        ],
      },
    ],
  };
}

describe('①往復（本命）: 取り込む → 何も触らない → 締める ⇒ none 1行だけ', () => {
  it('script_line_draft を素通しで取り込み、early を締めると none が1行だけ', () => {
    const proposal = linesProposal();
    // クライアント側の唯一の入口（applyProposalOps）で data に流し込む
    const plan = applyProposalOps(prevDoc(), 'script_line_draft', proposal);
    expect(plan.appliedIds.rows.sort()).toEqual(['row_1', 'row_2']);

    // サーバー: 人は何も触らずそのまま POST /apply
    const sanitized = sanitizeApplied({
      kind: 'script_line_draft',
      proposal,
      body: { applied_payload: plan.appliedPayload, applied_ids: plan.appliedIds, rejected_keys: [] },
      scenarioBlockId: SCENARIO_BLOCK_ID,
    });
    expect(sanitized.corrections).toEqual([]); // 何も触っていないので preview. 差分は0件
    expect(sanitized.droppedCount).toBe(0);

    // 締め（early）: after は「取り込み後の data」= plan.data と同じ行
    const afterRows = plan.data.sections.flatMap((s: any) => s.rows);
    const corrections = computeSettleCorrections({
      kind: 'script_line_draft',
      appliedPayload: sanitized.appliedPayload,
      appliedIds: sanitized.appliedIds,
      after: { rows: afterRows },
      stage: 'early',
      scenarioBlockId: SCENARIO_BLOCK_ID,
    });
    expect(corrections).toEqual([{ fieldPath: '(全体)', before: null, after: null, type: 'none' }]);
    expect(corrections).toHaveLength(1);
  });
});

describe('②表現形のずれ: duration_sec と "1:30" は同じ90秒に寄せる', () => {
  it('toComparableRow が両方 90 に寄せる', () => {
    const a = toComparableRow({ row_id: 'r1', duration_sec: 90 }, null);
    const b = toComparableRow({ row_id: 'r1', duration: '1:30' }, null);
    expect(a.duration).toBe(90);
    expect(b.duration).toBe(90);
  });
});

describe('③ name/html のずれ: speaker/text と entries[0]={name,html} は同じ扱い', () => {
  it('差分0件になる', () => {
    const proposalLine = { row_id: 'row_1', speaker: 'アナ', text: 'こんにちは' };
    const dataRow = { id: 'row_1', cells: { [SCENARIO_BLOCK_ID]: { entries: [{ name: 'アナ', html: 'こんにちは' }] } } };
    const a = toComparableRow(proposalLine, null);
    const b = toComparableRow(dataRow, SCENARIO_BLOCK_ID);
    expect(a).toEqual(b);
  });
});

describe('④人が後から足した行: applied_ids に無いので差分0件（enrich を出さない）', () => {
  it('after に余計な行があっても影響しない', () => {
    const appliedPayload: AppliedPayload = { rows: [{ row_id: 'row_1', duration: '0:30', cells: {} }] };
    const appliedIds: AppliedIds = { ...emptyIds(), rows: ['row_1'] };
    const after = { rows: [
      { id: 'row_1', duration: '0:30', cells: {} },
      { id: 'row_99', duration: '0:10', cells: {} }, // 人が後から足した行
    ] };
    const corrections = computeSettleCorrections({
      kind: 'script_line_draft', appliedPayload, appliedIds, after, stage: 'early', scenarioBlockId: SCENARIO_BLOCK_ID,
    });
    expect(corrections).toEqual([{ fieldPath: '(全体)', before: null, after: null, type: 'none' }]);
  });
});

describe('⑤人が消した行: reject が1件（none は出さない）', () => {
  it('applied_ids にある行が after に無いと reject', () => {
    const appliedPayload: AppliedPayload = { rows: [{ row_id: 'row_1', label: 'あ', duration: '0:30', cells: {} }] };
    const appliedIds: AppliedIds = { ...emptyIds(), rows: ['row_1'] };
    const corrections = computeSettleCorrections({
      kind: 'script_line_draft', appliedPayload, appliedIds, after: { rows: [] }, stage: 'early', scenarioBlockId: SCENARIO_BLOCK_ID,
    });
    expect(corrections).toHaveLength(1);
    expect(corrections[0].type).toBe('reject');
    expect(corrections[0].fieldPath).toBe('rows[row_1]');
    expect(corrections.some((c) => c.type === 'none')).toBe(false);
  });
});

describe('⑥field_path の鍵空間: rows[...] で始まる（第5引数を渡している）', () => {
  it('items の鍵空間に混ざらない', () => {
    const appliedPayload: AppliedPayload = { rows: [{ row_id: 'row_1', duration: '0:10', cells: {} }] };
    const appliedIds: AppliedIds = { ...emptyIds(), rows: ['row_1'] };
    const after = { rows: [{ id: 'row_1', duration: '0:20', cells: {} }] };
    const corrections = computeSettleCorrections({
      kind: 'script_line_draft', appliedPayload, appliedIds, after, stage: 'early', scenarioBlockId: SCENARIO_BLOCK_ID,
    });
    expect(corrections.length).toBeGreaterThan(0);
    for (const c of corrections) expect(c.fieldPath.startsWith('rows[')).toBe(true);
  });
});

describe('⑦late. 接頭辞: stage=final は全部 late. で始まる', () => {
  it('none も late.(全体) になる', () => {
    const appliedPayload: AppliedPayload = { rows: [{ row_id: 'row_1', duration: '0:30', cells: {} }] };
    const appliedIds: AppliedIds = { ...emptyIds(), rows: ['row_1'] };
    const after = { rows: [{ id: 'row_1', duration: '0:30', cells: {} }] };
    const corrections = computeSettleCorrections({
      kind: 'script_line_draft', appliedPayload, appliedIds, after, stage: 'final', scenarioBlockId: SCENARIO_BLOCK_ID,
    });
    expect(corrections).toEqual([{ fieldPath: 'late.(全体)', before: null, after: null, type: 'none' }]);
  });

  it('差分があるときも全部 late. で始まる', () => {
    const appliedPayload: AppliedPayload = { rows: [{ row_id: 'row_1', duration: '0:30', cells: {} }] };
    const appliedIds: AppliedIds = { ...emptyIds(), rows: ['row_1'] };
    const after = { rows: [{ id: 'row_1', duration: '0:40', cells: {} }] };
    const corrections = computeSettleCorrections({
      kind: 'script_line_draft', appliedPayload, appliedIds, after, stage: 'final', scenarioBlockId: SCENARIO_BLOCK_ID,
    });
    for (const c of corrections) expect(c.fieldPath.startsWith('late.')).toBe(true);
  });
});

describe('⑧preview. 差分: プレビューで書き換えて取り込む', () => {
  it('preview.rows[...].html の fix が1件、appliedPayload には人の値が入る', () => {
    const proposal = linesProposal();
    const plan = applyProposalOps(prevDoc(), 'script_line_draft', proposal);
    // 人がプレビューで row_1 の本文を書き換えた
    const editedPayload: AppliedPayload = {
      rows: plan.appliedPayload.rows.map((r: any) =>
        r.id === 'row_1'
          ? { ...r, cells: { ...r.cells, [SCENARIO_BLOCK_ID]: { entries: [{ name: 'アナ', html: 'おはようございます、今日も一日頑張りましょう' }] } } }
          : r),
    };
    const sanitized = sanitizeApplied({
      kind: 'script_line_draft',
      proposal,
      body: { applied_payload: editedPayload, applied_ids: plan.appliedIds, rejected_keys: [] },
      scenarioBlockId: SCENARIO_BLOCK_ID,
    });
    const htmlFix = sanitized.corrections.filter((c) => c.fieldPath.endsWith('.html') && c.type === 'fix');
    expect(htmlFix).toHaveLength(1);
    expect(htmlFix[0].fieldPath).toBe('preview.rows[row_1].html');
    const savedRow1 = (sanitized.appliedPayload.rows as any[]).find((r) => r.id === 'row_1');
    expect(savedRow1.cells[SCENARIO_BLOCK_ID].entries[0].html).toBe('おはようございます、今日も一日頑張りましょう');
  });
});

describe('⑨提案に無い要素: body に勝手な行を足しても落とされる', () => {
  it('applied_ids に入らず droppedCount が1、例外を投げない', () => {
    const proposal = linesProposal();
    const plan = applyProposalOps(prevDoc(), 'script_line_draft', proposal);
    const tamperedIds = { ...plan.appliedIds, rows: [...plan.appliedIds.rows, 'row_99_intruder'] };
    const tamperedPayload: AppliedPayload = {
      rows: [...plan.appliedPayload.rows, { row_id: 'row_99_intruder', cells: {} }],
    };
    expect(() => sanitizeApplied({
      kind: 'script_line_draft',
      proposal,
      body: { applied_payload: tamperedPayload, applied_ids: tamperedIds, rejected_keys: [] },
      scenarioBlockId: SCENARIO_BLOCK_ID,
    })).not.toThrow();
    const sanitized = sanitizeApplied({
      kind: 'script_line_draft',
      proposal,
      body: { applied_payload: tamperedPayload, applied_ids: tamperedIds, rejected_keys: [] },
      scenarioBlockId: SCENARIO_BLOCK_ID,
    });
    expect(sanitized.appliedIds.rows).not.toContain('row_99_intruder');
    expect(sanitized.droppedCount).toBe(1);
  });
});

describe('⑩rephrase の格上げ', () => {
  it('似た言い換えは rephrase になる', () => {
    const appliedPayload: AppliedPayload = { rows: [{ row_id: 'row_1', cells: { [SCENARIO_BLOCK_ID]: { entries: [{ name: 'アナ', html: 'おはようございます、本日もよろしくお願いします' }] } } }] };
    const appliedIds: AppliedIds = { ...emptyIds(), rows: ['row_1'] };
    const after = { rows: [{ id: 'row_1', cells: { [SCENARIO_BLOCK_ID]: { entries: [{ name: 'アナ', html: 'おはようございます、今日もよろしくお願いします' }] } } }] };
    const corrections = computeSettleCorrections({
      kind: 'script_line_draft', appliedPayload, appliedIds, after, stage: 'early', scenarioBlockId: SCENARIO_BLOCK_ID,
    });
    const htmlC = corrections.find((c) => c.fieldPath.endsWith('.html'));
    expect(htmlC?.type).toBe('rephrase');
  });

  it('同じ長さでも中身が別物の全面書き換えは fix のまま', () => {
    const appliedPayload: AppliedPayload = { rows: [{ row_id: 'row_1', cells: { [SCENARIO_BLOCK_ID]: { entries: [{ name: 'アナ', html: 'abcdefghij' }] } } }] };
    const appliedIds: AppliedIds = { ...emptyIds(), rows: ['row_1'] };
    const after = { rows: [{ id: 'row_1', cells: { [SCENARIO_BLOCK_ID]: { entries: [{ name: 'アナ', html: 'zzzzzzzzzz' }] } } }] };
    const corrections = computeSettleCorrections({
      kind: 'script_line_draft', appliedPayload, appliedIds, after, stage: 'early', scenarioBlockId: SCENARIO_BLOCK_ID,
    });
    const htmlC = corrections.find((c) => c.fieldPath.endsWith('.html'));
    expect(htmlC?.type).toBe('fix');
  });
});

describe('⑪台詞の伏せ: script_line_draft の html 差分は {len, head, hash}', () => {
  it('本文そのものを含まない', () => {
    const secret = 'これは社外秘の台詞です123456789012345678901234567890';
    const appliedPayload: AppliedPayload = { rows: [{ row_id: 'row_1', cells: { [SCENARIO_BLOCK_ID]: { entries: [{ name: 'アナ', html: secret }] } } }] };
    const appliedIds: AppliedIds = { ...emptyIds(), rows: ['row_1'] };
    const after = { rows: [{ id: 'row_1', cells: { [SCENARIO_BLOCK_ID]: { entries: [{ name: 'アナ', html: '別の台詞' }] } } }] };
    const corrections = computeSettleCorrections({
      kind: 'script_line_draft', appliedPayload, appliedIds, after, stage: 'early', scenarioBlockId: SCENARIO_BLOCK_ID,
    });
    const htmlC = corrections.find((c) => c.fieldPath.endsWith('.html'));
    expect(htmlC).toBeTruthy();
    const before = htmlC!.before as { len: number; head: string; hash: string };
    expect(before.len).toBe([...secret].length);
    expect(before.head).toBe([...secret].slice(0, 20).join(''));
    expect(JSON.stringify(htmlC)).not.toContain(secret);
    // event_plan_draft / script_outline_draft は落とさない (§7-2 REDACT_FIELDS)
  });
});

describe('⑫秒の解釈: サーバー(parseDur)とクライアント(parseDur)が同じ入力で同じ秒数', () => {
  it.each([
    ['1:30', 90],
    ['90', 90],
    ['0:01:30', 90],
    ['', 0],
    [null, 0],
  ] as const)('%s -> %d', (input, expected) => {
    expect(parseDurServer(input as any)).toBe(expected);
    expect(parseDurClient(input as any)).toBe(expected);
    expect(parseDurServer(input as any)).toBe(parseDurClient(input as any));
  });
});

describe('⑬順序反転(§5-2): early の実効期限は「取り込みから7日」と「final の期限」の早い方', () => {
  it('final が7日以内に来るなら early もそこで締まる', () => {
    const appliedAt = new Date('2026-08-01T00:00:00Z');
    const finalDueAt = new Date('2026-08-03T18:00:00+09:00'); // 2日後
    const earlyDue = computeEarlyDueAt(appliedAt, finalDueAt);
    expect(earlyDue.getTime()).toBe(finalDueAt.getTime());
  });

  it('final が7日より先なら自然な7日後', () => {
    const appliedAt = new Date('2026-08-01T00:00:00Z');
    const finalDueAt = new Date('2026-09-01T00:00:00Z');
    const earlyDue = computeEarlyDueAt(appliedAt, finalDueAt);
    expect(earlyDue.getTime()).toBe(appliedAt.getTime() + 7 * 86400000);
  });
});

describe('⑭final の理由: on_air > broadcast_date_passed > timeout の優先順位', () => {
  it('実尺の記録日があれば on_air', () => {
    const info = computeFinalDueInfo({ appliedAt: new Date(), broadcastDate: '2026-08-01', firstCueActualDate: '2026-08-05' });
    expect(info.reason).toBe('on_air');
  });
  it('無ければ broadcast_date_passed', () => {
    const info = computeFinalDueInfo({ appliedAt: new Date(), broadcastDate: '2026-08-01', firstCueActualDate: null });
    expect(info.reason).toBe('broadcast_date_passed');
  });
  it('どちらも無ければ timeout（30日後）', () => {
    const appliedAt = new Date('2026-08-01T00:00:00Z');
    const info = computeFinalDueInfo({ appliedAt, broadcastDate: null, firstCueActualDate: null });
    expect(info.reason).toBe('timeout');
    expect(info.dueAt.getTime()).toBe(appliedAt.getTime() + 30 * 86400000);
  });
});

// ============================================================
// ソースを読む見張り（`aiFeedback.test.ts` / `sqlPlaceholder.test.ts` と同じ形）
// ============================================================
const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

describe('⑮ソースの見張り', () => {
  it('applyProposal.ts は prev の関数（定数スナップショットで呼んでいない）', () => {
    const src = read('client-techops', 'src', 'lib', 'applyProposal.ts');
    expect(src).not.toMatch(/applyDataUpdate\(\s*ydoc\s*,\s*\(\)\s*=>/);
  });

  it('settle.service.ts は hasCorrections を呼んでいない（二重計上防止は条件付き UPDATE）', () => {
    const src = read('server', 'src', 'contexts', 'qsheet', 'ai', 'settle.service.ts');
    expect(src).not.toMatch(/hasCorrections\(/);
    expect(src).toMatch(/AND \$\{column\} IS NULL/);
  });

  it('scheduler.service.ts の qsheet_ai_settle / qsheet_ai_expire は templateId: null', () => {
    const src = read('server', 'src', 'contexts', 'platform', 'services', 'scheduler.service.ts');
    expect(src).toMatch(/key: 'qsheet_ai_expire', at: '03:15', templateId: null/);
    expect(src).toMatch(/key: 'qsheet_ai_settle', at: '03:20', templateId: null/);
  });

  it('apply.service.ts / settle.service.ts は AI を呼んでいない', () => {
    for (const f of ['apply.service.ts', 'settle.service.ts']) {
      const src = read('server', 'src', 'contexts', 'qsheet', 'ai', f);
      expect(src).not.toMatch(/callOpenAi|callAnthropic|from ['"]openai['"]/);
    }
  });

  it('migration に CREATE EXTENSION が無い（ベクトル検索は入れない）', () => {
    const src = read('server', 'src', 'shared', 'db', 'migrations', '222_qsheet_ai.sql');
    // `--` 注釈行は除いて見る（`pgvector を入れるなら…` という注釈自体が
    // 文字列として「CREATE EXTENSION」を含むため、素朴な全文一致だと自分の注釈に誤爆する）
    const executable = src.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(executable).not.toMatch(/CREATE EXTENSION/i);
  });

  it('qsheet_doc_index.is_reference は DEFAULT TRUE', () => {
    const src = read('server', 'src', 'shared', 'db', 'migrations', '222_qsheet_ai.sql');
    expect(src).toMatch(/is_reference\s+BOOLEAN NOT NULL DEFAULT TRUE/);
  });

  it('qsheet_ai_proposals.expires_at は NOT NULL DEFAULT（放置提案が分母から消えない）', () => {
    const src = read('server', 'src', 'shared', 'db', 'migrations', '222_qsheet_ai.sql');
    expect(src).toMatch(/expires_at\s+TIMESTAMPTZ NOT NULL DEFAULT/);
  });
});
