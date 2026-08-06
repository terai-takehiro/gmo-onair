/**
 * セキュリティカード — 画面が共有する決めごと (v4)
 *
 * ── レベルは DB を正にする ──────────────────────────────────
 *
 * migration 133 が **6レベル**を作っている
 * (`master` / `room_a` / `room_b` / `room_c` / `meeting` / `vip`)。
 * 解錠できる部屋は `access` (JSONB) に1部屋ずつ入っており、**カードごとに違う**。
 *
 * v4 のモックはレベルを3つに畳んでいるが、**実データと一致しないので採らない**。
 * 3つに畳むと「ROOM A のカード」と「ROOM B のカード」が同じ帯に見え、
 * 受付が違う部屋のカードを渡す。
 *
 * ── 色は `cat-1`〜`cat-8` を使う ─────────────────────────────
 *
 * レベルの違いは**危ない / 安全ではない**ので、状態の色 (success / warning /
 * destructive) を当ててはいけない。並べて見分けるための色 = `cat-*` を使う。
 */
import type { SecurityCard } from '@/lib/securityCardApi';

/** 表に出す順番。DB の `security_level` と1対1 */
export const LEVEL_ORDER = ['master', 'room_a', 'room_b', 'room_c', 'meeting', 'vip'] as const;

/** レベルごとの見分けの色 (意味は持たない)。知らないレベルは灰色にする */
export const LEVEL_TONE: Record<string, string> = {
  master: 'border-cat-7 text-cat-7',
  room_a: 'border-cat-2 text-cat-2',
  room_b: 'border-cat-3 text-cat-3',
  room_c: 'border-cat-5 text-cat-5',
  meeting: 'border-cat-8 text-cat-8',
  vip: 'border-cat-6 text-cat-6',
};

export const levelTone = (level: string) => LEVEL_TONE[level] ?? 'border-border text-muted-foreground';

// ── いまの状態 ──────────────────────────────────────────────

export type CardFilter = 'all' | 'available' | 'lent' | 'overdue';

export const FILTER_LABELS: Record<CardFilter, string> = {
  all: 'すべて',
  available: '貸せる',
  lent: '貸出中',
  overdue: '返却遅延',
};

/**
 * カードが絞り込みに当てはまるか。
 *
 * **「返却遅延」は「貸出中」の一部**。両方に数えられるので、チップの数字を
 * 足しても「すべて」にはならない。数えているものが違うことを画面にも書く。
 */
export function matchesFilter(card: SecurityCard, filter: CardFilter): boolean {
  switch (filter) {
    case 'available': return card.status === 'available';
    case 'lent': return card.status === 'lent';
    case 'overdue': return card.status === 'lent' && card.overdue;
    default: return true;
  }
}

/** 状態のバッジ。**返却遅延は貸出中と別に出す** (受付が催促する相手を間違えない) */
export function statusOf(card: SecurityCard): { label: string; tone: string } {
  if (card.status === 'available') {
    return { label: '貸せる', tone: 'border-success-border bg-success-surface text-success' };
  }
  if (card.overdue) {
    return { label: '返却遅延', tone: 'border-destructive-border bg-destructive-surface text-destructive' };
  }
  return { label: '貸出中', tone: 'border-warning-border bg-warning-surface text-warning' };
}

/** 番号 / レベル / 貸出先で探す。打ち込みの揺れは畳まない (番号と社名が主な手掛かり) */
export function matchesSearch(card: SecurityCard, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return String(card.card_no).includes(q)
    || card.level_label.toLowerCase().includes(q)
    || (card.borrower_company ?? '').toLowerCase().includes(q)
    || (card.borrower_person ?? '').toLowerCase().includes(q);
}
