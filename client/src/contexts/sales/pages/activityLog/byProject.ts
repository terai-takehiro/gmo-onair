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

interface ByProjectResponse {
  data: ProjectActivityGroup[];
  pagination?: { total: number; totalPages: number };
}

export interface ByProjectParams {
  due: DueFilter;
  search: string;
  userId: string;
  page: number;
}

const LIMIT = 20;

function toParams(p: ByProjectParams, limit = LIMIT): Record<string, string | number> {
  const q: Record<string, string | number> = { page: p.page, limit };
  if (p.due !== 'all') q.due = p.due;
  if (p.search) q.search = p.search;
  if (p.userId) q.user_id = p.userId;
  return q;
}

/** 案件別の一覧。⚠️ `signal` を渡す（渡さないと絞り込みを変えても前の通信が走り続ける） */
export function useByProject(p: ByProjectParams, enabled: boolean) {
  return useQuery<ByProjectResponse>({
    queryKey: ['activity-by-project', p.due, p.search, p.userId, p.page],
    queryFn: async ({ signal }) =>
      (await api.get('/activity-logs/by-project', { params: toParams(p), signal })).data,
    enabled,
    // 打鍵のたびに一覧が骨組みへ戻らないように、前の内容を残す
    placeholderData: (prev) => prev,
  });
}

/**
 * 絞り込みチップの件数。
 *
 * **数えているのは「案件の数」です**（1行＝1案件の画面なので、押した先に並ぶ数と
 * 一致するのはこちら）。契約の返りには集計の節が無いので、`limit=1` の軽い
 * 問い合わせを区分ごとに投げて `pagination.total` だけを読みます。
 * サーバーが集計を1本で返せるようになったら、ここは1リクエストに畳めます
 * （申し送り済み）。
 *
 * **押す前に 0 件だと分かること**が要点なので、数えられないときは
 * `null` を返して数字を出しません（`FilterChips` の約束）。
 */
export function useDueCounts(p: Omit<ByProjectParams, 'due' | 'page'>, enabled: boolean) {
  return useQuery<Record<DueFilter, number>>({
    queryKey: ['activity-by-project-counts', p.search, p.userId],
    queryFn: async ({ signal }) => {
      const dues: DueFilter[] = ['all', 'overdue', 'today', 'week', 'none'];
      const results = await Promise.all(
        dues.map(async (due) => {
          const params = toParams({ ...p, due, page: 1 }, 1);
          const r = await api.get('/activity-logs/by-project', { params, signal });
          return [due, (r.data?.pagination?.total ?? 0) as number] as const;
        }),
      );
      return Object.fromEntries(results) as Record<DueFilter, number>;
    },
    enabled,
  });
}
