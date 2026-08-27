/**
 * スタジオ予約の重複疑い検知（`server/.../bookingDuplicate.ts`）
 *
 * ── なぜここを試すのか ──────────────────────────────────────
 *
 * 複数の経路（案件ステージ自動生成・MCP・手入力）から同じ枠を指す予約が
 * 題名の言い回しだけ違う形（全角半角・語順・「収録」/「本番」）で二重に
 * 入ることが実際に多々あった。表記揺らぎの吸収と、時間帯・部屋・案件の
 * 組み合わせで「拾いすぎない」ことの両方をここで固定する。
 */
import { describe, it, expect } from 'vitest';
import {
  titleTokens,
  titleSimilarity,
  timeRangesOverlap,
  findDuplicateCandidate,
  type DuplicateCandidate,
} from '../../server/src/shared/services/bookingDuplicate';

describe('titleTokens — 表記揺らぎの正規化', () => {
  it('全角/半角・大文字小文字を揃える', () => {
    expect(titleTokens('ＧＬＳ－Ａ０１０　収録')).toEqual(['gls', 'a010', '収録']);
  });
  it('よくある同義語を1つに寄せる（本番=収録・リハ=リハーサル）', () => {
    expect(titleTokens('GLS-A010 本番')).toEqual(['gls', 'a010', '収録']);
    expect(titleTokens('GLS-A010 リハ')).toEqual(['gls', 'a010', 'リハーサル']);
  });
});

describe('titleSimilarity — 語順が違っても同じ予定と分かる', () => {
  it('語順が逆でも類似度1', () => {
    expect(titleSimilarity('収録 GLS-A010', 'GLS-A010 収録')).toBe(1);
  });
  it('「本番」と「収録」の言い換えも類似度1', () => {
    expect(titleSimilarity('GLS-A010 本番', 'GLS-A010 収録')).toBe(1);
  });
  it('無関係な題名は類似度が低い', () => {
    expect(titleSimilarity('GLS-A010 収録', '来客対応 打ち合わせ')).toBeLessThan(0.3);
  });
});

describe('timeRangesOverlap', () => {
  it('重なっていれば true', () => {
    expect(timeRangesOverlap('2026-08-20T10:00', '2026-08-20T13:00', '2026-08-20T12:00', '2026-08-20T15:00')).toBe(true);
  });
  it('隣接（片方の終了 = もう片方の開始）は重なりに数えない', () => {
    expect(timeRangesOverlap('2026-08-20T10:00', '2026-08-20T12:00', '2026-08-20T12:00', '2026-08-20T14:00')).toBe(false);
  });
  it('終日 (日付のみ) と時刻ありの予約でも比較できる', () => {
    expect(timeRangesOverlap('2026-08-20', '2026-08-20', '2026-08-20T10:00', '2026-08-20T12:00')).toBe(true);
  });
});

const candidate = (over: Partial<DuplicateCandidate>): DuplicateCandidate => ({
  id: 'existing-1',
  title: '収録 GLS-A010',
  project_id: 'proj-1',
  start_time: '2026-08-20T10:00',
  end_time: '2026-08-20T18:00',
  room_ids: ['room-1'],
  ...over,
});

describe('findDuplicateCandidate', () => {
  it('同じ案件・時間帯が重なる予約を拾う（部屋・題名が違っても）', () => {
    const result = findDuplicateCandidate(
      { title: '本番 GLS-A010', project_id: 'proj-1', start_time: '2026-08-20T11:00', end_time: '2026-08-20T19:00', room_ids: [] },
      [candidate({})],
    );
    expect(result?.bookingId).toBe('existing-1');
  });

  it('部屋が両方分かっていて重ならないなら、同じ案件でも別枠として除外する', () => {
    const result = findDuplicateCandidate(
      { title: '収録 GLS-A010', project_id: 'proj-1', start_time: '2026-08-20T11:00', end_time: '2026-08-20T19:00', room_ids: ['room-2'] },
      [candidate({ room_ids: ['room-1'] })],
    );
    expect(result).toBeNull();
  });

  it('案件が別でも、部屋が重なり題名がよく似ていれば拾う', () => {
    const result = findDuplicateCandidate(
      { title: '収録　ＧＬＳ－Ａ０１０', project_id: 'proj-2', start_time: '2026-08-20T11:00', end_time: '2026-08-20T19:00', room_ids: ['room-1'] },
      [candidate({})],
    );
    expect(result?.bookingId).toBe('existing-1');
  });

  it('案件も部屋も分からない者同士は、題名が似ていても拾わない（誤検知防止）', () => {
    const result = findDuplicateCandidate(
      { title: '収録 GLS-A010', project_id: null, start_time: '2026-08-20T11:00', end_time: '2026-08-20T19:00', room_ids: [] },
      [candidate({ project_id: null, room_ids: [] })],
    );
    expect(result).toBeNull();
  });

  it('時間帯が重ならなければ拾わない', () => {
    const result = findDuplicateCandidate(
      { title: '収録 GLS-A010', project_id: 'proj-1', start_time: '2026-08-21T10:00', end_time: '2026-08-21T18:00', room_ids: ['room-1'] },
      [candidate({})],
    );
    expect(result).toBeNull();
  });

  it('自分自身 (id 一致) は候補から除く', () => {
    const result = findDuplicateCandidate(
      { id: 'existing-1', title: '収録 GLS-A010', project_id: 'proj-1', start_time: '2026-08-20T10:00', end_time: '2026-08-20T18:00', room_ids: ['room-1'] },
      [candidate({})],
    );
    expect(result).toBeNull();
  });
});
