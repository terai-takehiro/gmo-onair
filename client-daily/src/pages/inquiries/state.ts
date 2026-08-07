/**
 * ⑤ 入ってきた情報 — 行き先・出どころ・次にできること（v4 大②・migration 171）
 *
 * ── 画面を持たない部分をここに出してある ─────────────────────
 *
 * 「その行にどのボタンを出すか」は要件そのもの（行き先は3つ＋見送り）なので、
 * 画面を立てずに素で試せる形にしてあります。
 *
 * ── モックとの違いは1つだけ ──────────────────────────────
 *
 * モックのタブは 未仕分け / ストック / チケット / 見送り の4つですが、
 * **本文が挙げている行き先には「案件の受付へ送る」も入っています**
 * （モックでは押してもダイアログが開くだけで、行が動きません）。
 *
 * そのまま作ると、案件の受付へ送ったものが未仕分けに残り続けます。
 * 受付は毎日その順に消化する画面なので、翌日また同じものを送り、
 * **同じ引き合いから案件が2件できます。** そこだけ `project` を足しました。
 */
import type { InquiryState, MiscInquiry } from '@/lib/types';

/** 行き先の色。**意味で決める**（画面ごとに変えない） */
export const STATE_TONE: Record<InquiryState, string> = {
  unsorted: 'border-transparent bg-warning-surface text-warning',
  stock: 'border-transparent bg-primary-surface text-primary',
  ticket: 'border-transparent bg-success-surface text-success',
  project: 'border-transparent bg-info-surface text-info',
  dropped: 'border-transparent bg-muted text-muted-foreground',
};

/** 出どころのアイコン名（lucide）。モックの `SRC` と同じ */
export const SOURCE_ICON: Record<string, 'mail' | 'message-square' | 'phone' | 'users' | 'pencil'> = {
  mail: 'mail', slack: 'message-square', phone: 'phone', talk: 'users', manual: 'pencil',
};

/**
 * その行で次にできること。
 *
 * - **チケットと案件からは「戻す」しか出さない。** 実体（タスク・案件）が
 *   出来ているので、そこから直接見送りにできると、拾い手のいる用件が
 *   誰にも気づかれずに消えます
 * - 見送りからは未仕分けに戻せる（間違えて押すことはある）
 */
export type InquiryAction = 'ticket' | 'toProject' | 'stock' | 'drop' | 'unsort';

export function actionsFor(state: InquiryState): InquiryAction[] {
  if (state === 'ticket' || state === 'project') return ['unsort'];
  if (state === 'dropped') return ['unsort'];
  if (state === 'stock') return ['ticket', 'toProject', 'drop'];
  return ['ticket', 'toProject', 'stock', 'drop'];
}

export const ACTION_LABEL: Record<InquiryAction, string> = {
  ticket: 'チケットにする',
  toProject: '案件の受付へ送る',
  stock: 'ストックする',
  drop: '見送りにする',
  unsort: '未仕分けに戻す',
};

/**
 * 出どころ別の件数（モックの右の枠）。
 *
 * モックの見出しは「今週」ですが、**中身は全件を数えています**。
 * 受信日が入っていない行が普通にあり、今週で切ると
 * 「出どころ別の合計 ≠ 一覧の件数」になって読み違えるので、
 * **全件で数えて見出しにもそう書きます**。
 */
export function bySource(rows: MiscInquiry[]): { source: string; total: number; ticket: number }[] {
  const seen: string[] = ['mail', 'slack', 'phone', 'talk'];
  for (const r of rows) if (!seen.includes(r.source)) seen.push(r.source);
  return seen
    .map((source) => ({
      source,
      total: rows.filter((r) => r.source === source).length,
      ticket: rows.filter((r) => r.source === source && r.state === 'ticket').length,
    }))
    // 4つの出どころは 0 件でも出す（「Slack からは来ていない」が読み取れる）。
    // それ以外（手で足した・出どころ不明の古い行）は**あるときだけ**出す
    .filter((s, i) => i < 4 || s.total > 0);
}
