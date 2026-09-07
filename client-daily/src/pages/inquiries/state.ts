/**
 * ⑤ 入ってきた情報 — 行き先・出どころ・次にできること（v4 大②・migration 171 / 247）
 *
 * ── 画面を持たない部分をここに出してある ─────────────────────
 *
 * 「その行にどのボタンを出すか」は要件そのもの（行き先は3つ＋見送り）なので、
 * 画面を立てずに素で試せる形にしてあります。
 *
 * ── 247: **行き先は5つのまま・タブは3つに畳んだ** ────────────
 *
 * `state` の5つ（未処理 / 保留 / タスク / 案件 / 見送り）は
 * DB の値なので変えていません。変えたのは**見せ方**で、
 * 「もう終わったもの」3つを1つのタブにまとめ、
 * 空いた場所を**「保留」を机に戻す仕掛け**に使っています。
 *
 * ── モックとの違いは1つだけ ──────────────────────────────
 *
 * モックのタブは 未処理 / 保留 / タスク / 見送り の4つですが、
 * **本文が挙げている行き先には「案件の受付へ送る」も入っています**
 * （モックでは押してもダイアログが開くだけで、行が動きません）。
 *
 * そのまま作ると、案件の受付へ送ったものが未処理に残り続けます。
 * 受付は毎日その順に消化する画面なので、翌日また同じものを送り、
 * **同じ引き合いから案件が2件できます。** そこだけ `project` を足しました。
 */
import type { InquiryState } from '@/lib/types';

/** 行き先の色。**意味で決める**（画面ごとに変えない） */
export const STATE_TONE: Record<InquiryState, string> = {
  unsorted: 'border-transparent bg-warning-surface text-warning',
  stock: 'border-transparent bg-primary-surface text-primary',
  ticket: 'border-transparent bg-success-surface text-success',
  project: 'border-transparent bg-info-surface text-info',
  dropped: 'border-transparent bg-muted text-muted-foreground',
  booked: 'border-transparent bg-info-surface text-info',
};

/** 出どころのアイコン名（lucide）。モックの `SRC` と同じ */
export const SOURCE_ICON: Record<string, 'mail' | 'message-square' | 'phone' | 'users' | 'pencil'> = {
  mail: 'mail', slack: 'message-square', phone: 'phone', talk: 'users', manual: 'pencil',
};

/**
 * その行で次にできること。
 *
 * - **タスクと案件からは「戻す」しか出さない。** 実体（タスク・案件）が
 *   出来ているので、そこから直接見送りにできると、拾い手のいる用件が
 *   誰にも気づかれずに消えます
 * - 見送りからは未処理に戻せる（間違えて押すことはある）
 */
export type InquiryAction = 'ticket' | 'toProject' | 'book' | 'stock' | 'restock' | 'drop' | 'unsort';

export function actionsFor(state: InquiryState): InquiryAction[] {
  if (state === 'ticket' || state === 'project' || state === 'booked') return ['unsort'];
  if (state === 'dropped') return ['unsort'];
  // 「保留」からは**見直す日を決め直せる**（migration 247）。
  // 「今日見たけれどまだ動けない」を受け止める先が無いと、
  // 机に出た「保留」は毎日出続けるか、見送りにされるかのどちらかになる
  if (state === 'stock') return ['ticket', 'toProject', 'book', 'restock', 'drop'];
  return ['ticket', 'toProject', 'book', 'stock', 'drop'];
}

/**
 * 一覧のボタンでどれを目立たせるか（`variant='default'`）。**既定は「タスクにする」**。
 *
 * `予定候補` タグ（decision-table.md「日程が明確なものには `予定候補` タグも足す」・
 * フェーズ1・ai-feedback-loop 監査 2026-09）が付いているものだけ
 * 「カレンダーに登録する」を目立たせる。**AI は予約を作らない** — 付くのは
 * タグだけで、行き先を決めるのは今までどおり人（このボタンを押す操作）
 */
export function primaryActionFor(tags: string[]): InquiryAction {
  return tags.includes('予定候補') ? 'book' : 'ticket';
}

export const ACTION_LABEL: Record<InquiryAction, string> = {
  ticket: 'タスクにする',
  toProject: '案件の受付へ送る',
  book: 'カレンダーに登録する',
  stock: '保留',
  restock: '見直す日を決め直す',
  drop: '見送りにする',
  unsort: '未処理に戻す',
};

/**
 * タブは3つ（247）。
 *
 * ── なぜ5つから3つに畳んだか ────────────────────────────────
 *
 * 5つのうち **4つが「受領証」**でした。タスク / 案件 / 見送り は
 * どれも「もう終わったもの」で、そこでできることは「未処理に戻す」だけ。
 * 片づいたものの棚を3つに割っても、**今日やることは1つも進みません**。
 * まとめて「仕分け済み」にし、行き先で絞れるようにしてあります。
 *
 * ⚠️ **`desk` と `stock` は重なります**（見直しの日が来た「保留」は両方に出る）。
 * セキュリティカードの「返却遅延は貸出中の一部」と同じで、
 * **足しても全件になりません**。画面にもそう書いてあります。
 */
export type InquiryTab = 'desk' | 'stock' | 'sorted';

export const TAB_LABEL: Record<InquiryTab, string> = {
  desk: '本日対応',
  stock: '保留',
  sorted: '仕分け済み',
};

/** 「仕分け済み」タブの中で行き先を絞る（受領証のタブを並べない） */
export const SORTED_STATES = ['ticket', 'project', 'booked', 'dropped'] as const;

/** 「仕分け済み」タブの中の絞り込み。`all` は3つぜんぶ */
export type SortedFilter = 'all' | (typeof SORTED_STATES)[number];

/**
 * 出どころ別の枠を**出すかどうか**（247）。
 *
 * ── なぜ判断を1本にするか ────────────────────────────────────
 *
 * 本番のメール取込は `source` をまだ渡していません（docs/mcp-server.md の
 * 「スキルに入れる変更」②・リポジトリ外のスキルなので人が直すまで届かない）。
 * その間この枠は **「メール N件 ／ Slack 0 ／ 電話 0 ／ 口頭 0」** と出続け、
 * 画面の右半分が **0 の枠**で埋まっていました。
 *
 * **出どころが1種類しかないうちは、内訳ではなく「まだ分かれていない」と書く。**
 * 数えるのはサーバー（`GET /dailyops/inquiries/counts`）で、
 * ここが決めるのは**出すか出さないか**だけです。
 */
export function hasSourceBreakdown(sources: { source: string; total: number }[]): boolean {
  return sources.filter((s) => s.total > 0).length >= 2;
}
