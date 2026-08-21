/**
 * 段10 (MCP) — `propose_qsheet_draft` の payload 検証（05-mcp.md §5・13-6）。
 *
 * ⚠️ **検証だけでなく、段7で既に実装済みの取り込み側
 * (`client-qsheet/src/lib/applyProposal.ts`) にそのまま通ることも確かめる。**
 * MCP が作る payload は、それを読む相手（`applyProposalOps`）が既に固定されているので、
 * 検証を通った後の形が本当に取り込めるかまで見ないと「検証は通ったが取り込めない」が起こる。
 */
import { describe, it, expect } from 'vitest';
import {
  validateOutlineProposal,
  validateLineProposal,
} from '../../server/src/contexts/qsheet/ai/mcpProposal';
import { applyProposalOps } from '../../client-qsheet/src/lib/applyProposal';

describe('validateOutlineProposal', () => {
  it('素直な提案はそのまま通る', () => {
    const { payload, dropped } = validateOutlineProposal({
      budget_sec: 5400,
      sections: [
        { key: 'S1', label: 'オープニング', duration_sec: 60, rows: [
          { key: 'S1.R1', label: '挨拶', duration_sec: 30, speaker: 'MC' },
        ] },
      ],
    });
    expect(dropped).toEqual([]);
    expect(payload.sections).toHaveLength(1);
    expect(payload.sections[0].rows[0].speaker).toBe('MC');
  });

  it('label に HTML が混ざっていたら落とす（XSS の口を塞ぐ）', () => {
    const { payload, dropped } = validateOutlineProposal({
      sections: [{ key: 'S1', label: '<b>乾杯</b>', duration_sec: 60, rows: [] }],
    });
    expect(payload.sections).toHaveLength(0);
    expect(dropped).toEqual([{ path: 'sections[0].label', reason: 'html' }]);
  });

  it('行の speaker / hint に HTML があれば行だけ落とす（section 自体は残る）', () => {
    const { payload, dropped } = validateOutlineProposal({
      sections: [{ key: 'S1', label: 'OP', duration_sec: 0, rows: [
        { key: 'S1.R1', label: 'ふつうの行', duration_sec: 10, speaker: 'MC' },
        { key: 'S1.R2', label: '<script>', duration_sec: 10, speaker: 'MC' },
      ] }],
    });
    expect(payload.sections[0].rows).toHaveLength(1);
    expect(dropped).toEqual([{ path: 'sections[0].rows[1]', reason: 'html' }]);
  });

  it('label が無い section は missing_field で落とす', () => {
    const { payload, dropped } = validateOutlineProposal({ sections: [{ key: 'S1', rows: [] }] });
    expect(payload.sections).toHaveLength(0);
    expect(dropped[0].reason).toBe('missing_field');
  });

  it('負の duration_sec は 0 に丸める（不正値で壊さない）', () => {
    const { payload } = validateOutlineProposal({
      sections: [{ key: 'S1', label: 'OP', duration_sec: -30, rows: [] }],
    });
    expect(payload.sections[0].duration_sec).toBe(0);
  });
});

describe('validateLineProposal', () => {
  const existingRowIds = new Set(['row_1', 'row_2']);

  it('実在する row_id だけを通す', () => {
    const { payload, dropped } = validateLineProposal(
      { lines: [{ row_id: 'row_1', name: 'アナ', text: 'こんにちは' }] },
      existingRowIds,
    );
    expect(dropped).toEqual([]);
    expect(payload.lines).toHaveLength(1);
  });

  it('実在しない row_id は bad_reference で落とす（AI の幻覚 id を書かせない）', () => {
    const { payload, dropped } = validateLineProposal(
      { lines: [{ row_id: 'row_99_ghost', name: 'アナ', text: 'こんにちは' }] },
      existingRowIds,
    );
    expect(payload.lines).toHaveLength(0);
    expect(dropped).toEqual([{ path: 'lines[0].row_id', reason: 'bad_reference', detail: 'row_99_ghost' }]);
  });

  it('text に HTML が混ざっていたら落とす', () => {
    const { dropped } = validateLineProposal(
      { lines: [{ row_id: 'row_1', name: 'アナ', text: '<img onerror=alert(1)>' }] },
      existingRowIds,
    );
    expect(dropped).toEqual([{ path: 'lines[0]', reason: 'html' }]);
  });

  it('対象文書にまだ行が無いときは warning を返す（構造は壊さない）', () => {
    const { payload, warnings } = validateLineProposal(
      { lines: [{ row_id: 'row_1', name: 'アナ', text: 'こんにちは' }] },
      new Set(),
    );
    expect(payload.lines).toHaveLength(0); // row_1 も実在しないので bad_reference で落ちる
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe('検証を通った payload は取り込み側 (applyProposalOps) にそのまま通る', () => {
  it('script_outline_draft: 検証後の sections がそのまま data に足される', () => {
    const { payload } = validateOutlineProposal({
      sections: [{ key: 'S1', label: 'OP', duration_sec: 60, rows: [
        { key: 'S1.R1', label: '挨拶', duration_sec: 30, speaker: 'MC' },
      ] }],
    });
    const prev = { blocks: [{ id: 'scenario', type: 'scenario' }], sections: [] };
    const plan = applyProposalOps(prev, 'script_outline_draft', payload);
    expect(plan.appliedIds.sections).toHaveLength(1);
    expect(plan.appliedIds.rows).toHaveLength(1);
    expect(plan.data.sections).toHaveLength(1);
    expect(plan.data.sections[0].rows[0].cells.scenario.entries[0].name).toBe('MC');
  });

  it('script_line_draft: 検証で bad_reference を落とした後の lines は既存行だけを埋める', () => {
    const prevDoc = {
      blocks: [{ id: 'scenario', type: 'scenario' }],
      sections: [{ id: 'sec_1', label: 'OP', rows: [{ id: 'row_1', cells: {} }] }],
    };
    const existing = new Set(['row_1']);
    const { payload, dropped } = validateLineProposal(
      { lines: [
        { row_id: 'row_1', name: 'アナ', text: 'おはようございます' },
        { row_id: 'row_ghost', name: 'MC', text: 'これは幻覚' },
      ] },
      existing,
    );
    expect(dropped).toHaveLength(1);
    const plan = applyProposalOps(prevDoc, 'script_line_draft', payload);
    expect(plan.appliedIds.rows).toEqual(['row_1']);
    expect(plan.data.sections[0].rows[0].cells.scenario.entries[0].html).toBe('おはようございます');
  });
});
