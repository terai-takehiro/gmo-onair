/**
 * セキュリティカード — 画面が共有する決めごと (v4)
 *
 * ── レベルは DB を正にする ──────────────────────────────────
 *
 * migration 133 が **6レベル**を作っている
 * (`master` / `room_a` / `room_b` / `room_c` / `meeting` / `vip`)。
 * 解錠できる部屋は `access` (JSONB) に1部屋ずつ入っており、**カードごとに違う**。
 *
 * ── モックの3分類は「まとめ方」として採る ─────────────────────
 *
 * モックは 全域 / 技術 / 共用 の3つに畳んでいる。**番号の帯は実データと違う**
 * (モックは全域 No.1-4 だが、実データは No.1-9) ので採らない。
 * ただし**まとめ方そのものは実データとぴったり合う**:
 *
 *   全域 = `master`                       (No.1-9  ・10エリア)
 *   技術 = `room_a` / `room_b` / `room_c` (No.10-18・スタジオ ＋ 会議室)
 *   共用 = `meeting` / `vip`              (No.19-24・会議室まわりだけ)
 *
 * **カード1枚に出す名前は 6 レベルのまま**にする。3つに畳んだ名前だけを出すと
 * 「ROOM A のカード」と「ROOM B のカード」が同じに見え、受付が違う部屋の
 * カードを渡す。**まとめ方は3つ・1枚の名前は6つ**、が実データに合った形。
 *
 * ── 色はモックの実測値 ───────────────────────────────────────
 *
 * 全域 = 赤 (`#c7243a` / 地 `#fef6f7`)、技術 = 青 (`#005bac` / 地 `#eaf4fb`)、
 * 共用 = 灰 (`#5d6470` / 地 `#f2f4f7`)。ここでの赤は「危ない」ではなく
 * **「このカードは全部開く。渡す相手を確かめて」**という意味なので、
 * 状態の色を当てて差し支えない (モックがそう決めている)。
 */
import type { SecurityCard } from '@/lib/securityCardApi';

/** 表に出す順番。DB の `security_level` と1対1 */
export const LEVEL_ORDER = ['master', 'room_a', 'room_b', 'room_c', 'meeting', 'vip'] as const;

/**
 * レベルごとの見分けの色 (意味は持たない)。知らないレベルは灰色にする。
 *
 * **`cat-5`（山吹 #d2a400）は文字に使わないこと。** 白地でのコントラストが
 * 基準（`verify-ui` の「薄すぎる文字」）を満たしません。実測で
 * `ROOM C + 会議室` の見出しとカード番号が落ちました。
 * 罫線だけなら使えますが、文字と揃えたいので `cat-4`（深緑）にしてあります。
 */
export const LEVEL_TONE: Record<string, string> = {
  master: 'border-cat-7 text-cat-7',
  room_a: 'border-cat-2 text-cat-2',
  room_b: 'border-cat-3 text-cat-3',
  room_c: 'border-cat-4 text-cat-4',
  meeting: 'border-cat-8 text-cat-8',
  vip: 'border-cat-6 text-cat-6',
};

export const levelTone = (level: string) => LEVEL_TONE[level] ?? 'border-border text-muted-foreground';

// ── モックの3分類 (まとめ方・絞り込み・帯の色) ────────────────────

export type LevelGroup = 'all_area' | 'tech' | 'shared';

/** 6つのレベル → モックの3分類。知らないレベルは「共用」に寄せない (`null`) */
export const LEVEL_GROUP: Record<string, LevelGroup> = {
  master: 'all_area',
  room_a: 'tech',
  room_b: 'tech',
  room_c: 'tech',
  meeting: 'shared',
  vip: 'shared',
};

export const GROUP_ORDER: LevelGroup[] = ['all_area', 'tech', 'shared'];

export const GROUP_LABELS: Record<LevelGroup, string> = {
  all_area: '全域',
  tech: '技術',
  shared: '共用',
};

/** モックの色。全域だけ赤なのは「全部開くカード」だと一目で分かるようにするため */
export const GROUP_TONE: Record<LevelGroup, string> = {
  all_area: 'border-destructive-border bg-destructive-surface text-destructive',
  tech: 'border-primary-border bg-primary-surface text-primary',
  shared: 'border-border bg-muted text-muted-foreground',
};

export function groupOf(level: string): LevelGroup | null {
  return LEVEL_GROUP[level] ?? null;
}

export function groupLabel(level: string): string {
  const g = groupOf(level);
  return g ? GROUP_LABELS[g] : 'その他';
}

export function groupTone(level: string): string {
  const g = groupOf(level);
  return g ? GROUP_TONE[g] : 'border-border bg-muted text-muted-foreground';
}

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
