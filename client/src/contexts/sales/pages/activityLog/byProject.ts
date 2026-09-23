/**
 * 案件別のやること（`GET /activity-logs/by-project`）の型と問い合わせ (v4)
 *
 * ── なぜ案件別の口を別に立てたか ────────────────────────────
 *
 * 利用者のご指摘「**案件別に見られないと分からない**」への対応です。
 * 記録を時系列に並べた一覧は「いつ何をしたか」は読めますが、営業担当が知りたい
 * 「**この案件で次に何をするのか**」は、同じ案件の行が日付順にばらけるため
 * 一覧からは組み立てられませんでした。
 *
 * 画面側で案件ごとにまとめ直す案は採りません — 1ページ20件の中でまとめても
 * **ページの切れ目で同じ案件が2つに割れます**。まとめるのはサーバーの仕事です。
 *
 * ── 型はサーバーの契約をそのまま写したもの ──────────────────
 *
 * `any` で受けると、列名を変えたときに画面が**静かに空欄になります**。
 * 契約に無いものを勝手に足さないこと（足すならサーバーと同時に）。
 */
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { DueFilter } from './dueState';

/** 案件のまとまりにぶら下がる「未完了の次のアクション」1件 */
export interface NextActionItem {
  id: string;
  subject: string;
  activity_date: string;
  activity_type: string;
  next_action: string | null;
  /** 帯の1行に収める短い一文（migration 190）。無ければ `next_action` を出す */
  next_action_short: string | null;
  next_action_date: string | null;
  next_action_done_at: string | null;
  next_action_auto_closed_reason: string | null;
  /**
   * **AI が立てたやることか**（`ai_outputs` に `next_action` を含む直近の出力がある）。
   *
   * ⚠️ 人が書いた行と見た目を同じにしないこと。同じにすると、利用者は
   * 「AI の間違いを直した」つもりで削除するのに**差分が1件も残らない回**が混ざります
   * （`ai_outputs` に出力が無い行は `ai_corrections` に積めない）。
   * 印が付いている行の削除だけが「時効なし」の否定の経路を通ります（設計監査の要件16）。
   * 古い口が返さないこともあるので `?` — **来ていなければ印を出さない**（嘘の印を出さない）。
   */
  ai_generated?: boolean;
  /** サーバーが数えた期限の区分。画面は自分でも `duePartsOf` で同じ判定をする */
  due_bucket?: string;
}

/** 1案件のまとまり。`project_id: null` は「案件にひも付かない記録」（最後に置かれる） */
export interface ProjectActivityGroup {
  project_id: string | null;
  project_name: string | null;
  project_gls: string | null;
  project_code: string | null;
  customer_id: string | null;
  customer_name: string | null;
  stage: string | null;
  event_start: string | null;
  /** 実施日の総数（0 = 未定）。`eventDateLabel` にそのまま渡す */
  event_day_count: number | null;
  owner_name: string | null;
  activity_count: number;
  last_activity_date: string | null;
  last_activity_type: string | null;
  last_activity_subject: string | null;
  overdue_count: number;
  today_count: number;
  week_count: number;
  none_count: number;
  /** 未完了の次のアクション（最大5件・期限の近い順・期限未設定は最後） */
  actions: NextActionItem[];
}

/**
 * 区分ごとの件数（`summary.actions` / `summary.projects` の1つぶん）。
 * 区分の定義は `dueState.ts` の冒頭と同じ。`all` は**未完了の次のアクションすべて**
 * （本日+8 以降も含む）なので、4区分の和とは一致しないことがある。
 */
export type DueCounts = Record<DueFilter, number>;

/**
 * 絞り込みチップの件数（PR #727 の宿題①）。
 *
 * ── なぜ2種類を持つか ──────────────────────────────────────
 *
 * PR #727 では区分ごとに `limit=1` で5回問い合わせて `pagination.total`
 * （＝**案件の数**）をチップに出していました。ところがチップの名前は
 * 「期限超過」「本日・明日」＝**やることの区分**で、利用者は「期限超過 3」を
 * 「期限を超えたやることが3件」と読みます。1案件に期限超過が5件あっても
 * 「1」と出る食い違いでした。
 *
 * - `actions`  … 未完了の次のアクションの件数（**チップの数字はこちら**）
 * - `projects` … その区分のやることを1件以上持つ案件の数（押した先に並ぶまとまりの数・小さく添える）
 *
 * **サーバーは `due` の絞り込みを無視し、`search`・`user_id`・`owner_id` だけを効かせて数えます**
 * （どの区分を選んでいても全区分の件数を出すため）。`project_id` が null の
 * まとまり（案件にひも付かない記録）は `projects` では1件として数えます。
 *
 * 古いサーバー（summary を返さない）もあるので `?` — **来ていなければ数字を出さない**
 * （0 と出すと「押しても何も無い」と嘘をつく）。
 */
export interface ByProjectSummary {
  actions: DueCounts;
  projects: DueCounts;
}

interface ByProjectResponse {
  data: ProjectActivityGroup[];
  pagination?: { total: number; totalPages: number };
  summary?: ByProjectSummary;
}

export interface ByProjectParams {
  due: DueFilter;
  search: string;
  userId: string;
  /** 案件の担当者（`owner_id`）。記録者の `userId` とは別。空文字＝すべて */
  ownerId: string;
  page: number;
}

const LIMIT = 20;

function toParams(p: ByProjectParams, limit = LIMIT): Record<string, string | number> {
  const q: Record<string, string | number> = { page: p.page, limit };
  if (p.due !== 'all') q.due = p.due;
  if (p.search) q.search = p.search;
  if (p.userId) q.user_id = p.userId;
  if (p.ownerId) q.owner_id = p.ownerId;
  return q;
}

/** 案件別の一覧。⚠️ `signal` を渡す（渡さないと絞り込みを変えても前の通信が走り続ける） */
export function useByProject(p: ByProjectParams, enabled: boolean) {
  return useQuery<ByProjectResponse>({
    queryKey: ['activity-by-project', p.due, p.search, p.userId, p.ownerId, p.page],
    queryFn: async ({ signal }) =>
      (await api.get('/activity-logs/by-project', { params: toParams(p), signal })).data,
    enabled,
    // 打鍵のたびに一覧が骨組みへ戻らないように、前の内容を残す
    placeholderData: (prev) => prev,
  });
}

/*
 * ── 件数の問い合わせを別に立てない理由 ─────────────────────
 *
 * 以前はここに `useDueCounts`（鍵 `['activity-by-project-counts']`・5回問い合わせ）が
 * ありました。summary は **`due` と `page` に左右されない**ので、一覧の返りに
 * 乗っているものをそのまま読めば足ります（`LogTab.tsx` が `byProject.data?.summary`
 * を読む）。1回の表示で6本 → 1本になり、「一覧は新しいのにチップだけ古い」という
 * 2本の問い合わせの間のずれも起きません。
 *
 * ⚠️ そのため**件数を最新にするには `['activity-by-project']` を落とせば足ります。**
 * 旧い鍵 `['activity-by-project-counts']` は廃止し、落としていた2か所
 * （`ActivityLogDialog.tsx`・`projectDetail/thread/useThreadEdit.ts`）からも外しました。
 */
