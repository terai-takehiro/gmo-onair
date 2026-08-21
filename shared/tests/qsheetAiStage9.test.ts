/**
 * 制作資料 v4 段9（digest分岐・ナレッジ・月次レポート）の純関数を固定する。
 *
 * server は `shared/` を import しない構成なので、既存の qsheetAi 系試験と同じく
 * server のファイルを相対 import する。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { promptVersionOf } from '../../server/src/contexts/qsheet/ai/kinds';
import { prevMonthPeriodKey, daysInMonth } from '../../server/src/contexts/qsheet/ai/monthly-review.service';

describe('promptVersionOf — ナレッジ版とadvice有無の刻み方（04-ai.md §6-5a）', () => {
  it('ナレッジ未承認・advice無しならベースのまま', () => {
    expect(promptVersionOf('script-outline-v1', 0, 0)).toBe('script-outline-v1');
  });
  it('ナレッジrev>0なら +k<rev> を付ける', () => {
    expect(promptVersionOf('script-outline-v1', 7, 0)).toBe('script-outline-v1+k7');
  });
  it('adviceがあれば +fb を付ける（ナレッジの有無に関わらず末尾に付く）', () => {
    expect(promptVersionOf('script-outline-v1', 0, 3)).toBe('script-outline-v1+fb');
    expect(promptVersionOf('script-outline-v1', 7, 3)).toBe('script-outline-v1+k7+fb');
  });
});

describe('prevMonthPeriodKey / daysInMonth — 月次レビューの対象期間（04-ai.md §5-5）', () => {
  it('1月なら前年12月になる（年をまたぐ）', () => {
    expect(prevMonthPeriodKey('2026-01-01')).toBe('2025-12');
  });
  it('通常の月は単純に1つ前', () => {
    expect(prevMonthPeriodKey('2026-09-01')).toBe('2026-08');
  });
  it('うるう年の2月も正しい日数になる', () => {
    expect(daysInMonth('2024-02')).toBe(29);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2026-08')).toBe(31);
  });
});

describe('ナレッジは draft のままプロンプトに載らない（04-ai.md §6-3 最重要事項）', () => {
  const KNOWLEDGE = readFileSync(
    join(__dirname, '..', '..', 'server', 'src', 'contexts', 'qsheet', 'ai', 'knowledge.ts'), 'utf8',
  );
  it('listActiveKnowledge が status=active しか読まない', () => {
    const at = KNOWLEDGE.indexOf('export async function listActiveKnowledge');
    expect(at).toBeGreaterThan(0);
    expect(KNOWLEDGE.slice(at, at + 700)).toMatch(/WHERE status = 'active'/);
  });
  it('draftAutoKnowledge は draft で作る（自動昇格させない）', () => {
    const at = KNOWLEDGE.indexOf('export async function draftAutoKnowledge');
    expect(at).toBeGreaterThan(0);
    expect(KNOWLEDGE.slice(at, at + 900)).toMatch(/'draft', 'auto'/);
  });
});

describe('月次レビューは確定済みを上書きしない（既存の下書き→確定フローの作法）', () => {
  const REVIEW = readFileSync(
    join(__dirname, '..', '..', 'server', 'src', 'contexts', 'qsheet', 'ai', 'monthly-review.service.ts'), 'utf8',
  );
  it('published か reviewed_at 有りなら書き換えない', () => {
    expect(REVIEW).toMatch(/existing\.status === 'published' \|\| existing\.reviewed_at/);
  });
  it('担当者は環境変数から解決し、居なければ NULL のまま（名前をハードコードしない）', () => {
    expect(REVIEW).toMatch(/QSHEET_AI_REVIEW_OWNER_USER_ID/);
    expect(REVIEW).not.toMatch(/'[^']*(太郎|花子|山田|佐藤|manager1)'/);
  });
});
