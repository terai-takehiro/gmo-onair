/**
 * プロジェクト管理（GPM）— 問い合わせを1か所にまとめる
 *
 * ── なぜ画面ごとに `useQuery` を書かないか ──────────────────
 *
 * 7画面のうち5画面が同じ2本（プロジェクト一覧・未確認事項）を読みます。
 * 画面ごとに鍵（`queryKey`）を書くと、
 *
 *   ・**書き換えたのに別の画面が古いまま**になる（鍵が違うと落ちない）
 *   ・同じ数を別々の条件で数えてしまう（ダッシュボードと一覧で件数が違う）
 *
 * が必ず起きます。案件管理で実際に起きた形（`invalidateTasks` が
 * `task-dashboard` を落としていなかった）と同じなので、最初から1か所にします。
 *
 * ── 絞り込みをサーバーに投げない理由 ────────────────────────
 *
 * 状態（進行中／準備中／完了／保留）はサーバーで絞れますが、
 * **絞り込みチップの件数を返す API がありません**。件数を出すために
 * 状態ごとに5回叩くと、遅い1本のせいで数字が後から入れ替わります。
 * 構築プロジェクトは同時に数十件の規模なので、**1回で全部取って
 * 画面で分ける**ほうが正確で速い（数える場所も1か所になる）。
 * 件数が3桁になったらサーバーに `status_counts` を足して切り替えます。
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { LegalEntity } from '@/contexts/platform/pages/reorg/types';
import type { GpmOpenItem, GpmProjectDetail, GpmProjectRow, GpmTask, GpmTemplate } from './types';

export const gpmKeys = {
  projects: (q: string) => ['gpm-projects', q] as const,
  project: (id: string) => ['gpm-project', id] as const,
  openItems: (status: string) => ['gpm-open-items', status] as const,
  projectTasks: (projectId: string) => ['gpm-project-tasks', projectId] as const,
  templates: () => ['gpm-templates'] as const,
  users: () => ['gpm-users'] as const,
  customers: () => ['gpm-customers'] as const,
  estimates: (projectId: string, includeArchived = false) =>
    ['gpm-estimates', projectId, includeArchived] as const,
  estimateSummary: () => ['gpm-estimate-summary'] as const,
};

/**
 * 見積 (v4 大⑤)。**案件（GLS）の見積とは混ざりません** —
 * `estimates` は同じ表ですが `project_id` と `project_id` が排他で、
 * サーバー側で片方だけを引いています。
 */
export interface GpmEstimate {
  id: string;
  project_id: string;
  submit_to: 'self' | 'client' | 'pm' | null;
  group_id: string;
  version: number;
  title: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'superseded';
  subtotal: number;
  discount: number;
  valid_until: string | null;
  sent_at: string | null;
  decided_at: string | null;
  updated_at: string;
  /** 値引きの承認。`pending` の間は送れない（お金のルール ⑤・案件と同じ規則） */
  approval_state?: 'none' | 'pending' | 'approved' | null;
  /** いま見ている人が承認できるか。**サーバーが決める**（押して 403 にしない） */
  can_approve?: boolean;
  /** 承認者に決められているか（編集権限は見ない）。できない理由を名指しするために使う */
  is_approver?: boolean;
  /** アーカイブした日時。`null`/未設定なら一覧に出る（migration 236） */
  archived_at?: string | null;
}

export interface GpmEstimateSummary {
  draft: number; draft_amount: number;
  sent: number; sent_amount: number;
  awaiting_inspection: number; awaiting_inspection_amount: number;
}

// `includeArchived` は既定 false（サーバーの既定と揃える。migration 236）。
// 「アーカイブした版を表示」を押したときだけ true にして引き直す
export function useGpmEstimates(projectId: string, includeArchived = false) {
  return useQuery<GpmEstimate[]>({
    queryKey: gpmKeys.estimates(projectId, includeArchived),
    queryFn: async () => (await api.get(`/gpm/projects/${projectId}/estimates`,
      { params: includeArchived ? { include_archived: '1' } : undefined })).data.data,
    enabled: !!projectId,
  });
}

export function useGpmEstimateSummary() {
  return useQuery<GpmEstimateSummary>({
    queryKey: gpmKeys.estimateSummary(),
    queryFn: async () => (await api.get('/gpm/estimates/summary')).data.data,
  });
}

/**
 * プロジェクト一覧。`q`（探している言葉）だけサーバーに渡します
 * — 名前とお客様名の部分一致はエスケープが要るのでサーバーの仕事。
 */
export function useGpmProjects(q = '') {
  return useQuery<GpmProjectRow[]>({
    queryKey: gpmKeys.projects(q),
    queryFn: async () =>
      (await api.get('/gpm/projects', { params: q ? { q } : undefined })).data.data,
  });
}

export function useGpmProject(id: string) {
  return useQuery<GpmProjectDetail>({
    queryKey: gpmKeys.project(id),
    queryFn: async () => (await api.get(`/gpm/projects/${id}`)).data.data,
    enabled: !!id,
  });
}

/**
 * 計上会社マスター（GJV/GSS/GMO の3行）。プロジェクト詳細が
 * 「予算と実績」タブに切り替えるかどうか（`isCostCenterProject()`）の判定に使う
 * （2026年10月の事業再編・P3）。
 *
 * ⚠️ **鍵は `entityFilter.tsx`/`ReorgPage.tsx` と同じ `['legal-entities']` にする。**
 * 会社マスターはどこから開いても同じ内容なので、片方が読んだキャッシュを
 * もう片方も使い回せる（鍵を分けると同じ3行を画面ごとに引き直すだけになる）。
 */
export function useLegalEntities() {
  return useQuery<LegalEntity[]>({
    queryKey: ['legal-entities'],
    queryFn: async () => (await api.get('/legal-entities')).data.data,
    staleTime: 5 * 60_000,
  });
}

/**
 * 未確認事項をプロジェクトまたぎで。
 * 既定（`status` を渡さない）は**解決済みを外した全部**です
 * — ダッシュボードと ⑤ タスク一覧が数えるのはこの集合。
 */
export function useGpmOpenItems(status = '') {
  return useQuery<GpmOpenItem[]>({
    queryKey: gpmKeys.openItems(status),
    queryFn: async () =>
      (await api.get('/gpm/open-items', { params: status ? { status } : undefined })).data.data,
  });
}

/**
 * ⑤ 全プロジェクトのタスク (migration 169 の回で足した `GET /gpm/tasks`)。
 *
 * **既存の `/tasks` では引けません** — GPM のタスクは `project_id` が NULL で、
 * 既存の一覧は `JOIN projects` するため1件も返りません。
 */
export function useGpmTasks(status = 'open') {
  return useQuery({
    queryKey: ['gpm', 'tasks', status],
    queryFn: async () =>
      (await api.get('/gpm/tasks', { params: status ? { status } : {} })).data.data as GpmTask[],
    staleTime: 30_000,
  });
}

/**
 * ③ プロジェクト詳細の工程の下に出すタスク。**完了したものも含めて全部**取ります
 * （工程の「3 / 7」の分母と、下に並ぶ行の数が食い違わないように）。
 *
 * `GET /gpm/projects/:id` は工程の**件数だけ**を返します。中身をそこに積むと、
 * 未確認事項・体制と一緒に毎回運ぶことになるので、タスクは別の口で引きます。
 */
export function useGpmProjectTasks(projectId: string) {
  return useQuery({
    queryKey: gpmKeys.projectTasks(projectId),
    queryFn: async () =>
      (await api.get('/gpm/tasks', { params: { project_id: projectId, status: 'all' } })).data.data as GpmTask[],
    enabled: !!projectId,
  });
}

export function useGpmTemplates() {
  return useQuery<GpmTemplate[]>({
    queryKey: gpmKeys.templates(),
    queryFn: async () => (await api.get('/gpm/templates')).data.data,
  });
}

/** PM に選べる人＝`gpm` の権限を持っている人。持っていない人を選べても意味が無い */
/**
 * 依頼元に選べるお客様。
 *
 * **自由入力ではありません** (migration 179)。プロジェクトは GLS-B の案件になり、
 * 依頼元は `customers` への参照（`customer_id`）です。文字を打たせると
 * 打った名前がどこにも保存されないうえ、同じ会社が表記ゆれで増えます。
 */
export function useGpmCustomers() {
  return useQuery<{ id: string; name: string }[]>({
    queryKey: gpmKeys.customers(),
    /*
     * ⚠️ **`/customers` を直接引かないこと**（レビューでの指摘 #67）。
     * あちらは `sales` を要求するので、`gpm` だけの人には 403 が返り、
     * **依頼元を1件も選べず、プロジェクトを作れません**でした。
     * `gpm` の口は id と名前だけを返します（選ぶのに要るのはそれだけ）。
     */
    queryFn: async () => (await api.get('/gpm/customers')).data.data,
  });
}

export function useGpmUsers() {
  return useQuery<{ id: string; name: string; email: string }[]>({
    queryKey: gpmKeys.users(),
    queryFn: async () => (await api.get('/users/by-module/gpm')).data.data,
  });
}

/**
 * 書き換えたあとに読み直すもの。
 *
 * **プロジェクト・未確認事項・ひな形は互いに影響し合う**ので、
 * まとめて落とします（ひな形を消すと一覧の「適用中」が変わり、
 * 未確認事項を解決するとプロジェクト一覧の件数が変わる）。
 * 鍵の接頭辞で落とすので、絞り込みの違う写しも一緒に落ちます。
 */
export function useInvalidateGpm() {
  const qc = useQueryClient();
  return (...ids: string[]) => {
    qc.invalidateQueries({ queryKey: ['gpm-projects'] });
    qc.invalidateQueries({ queryKey: ['gpm-open-items'] });
    qc.invalidateQueries({ queryKey: ['gpm-templates'] });
    // 見積を書き換えるとダッシュボードの KPI 2枚が変わる。**一緒に落とす**
    qc.invalidateQueries({ queryKey: ['gpm-estimates'] });
    qc.invalidateQueries({ queryKey: ['gpm-estimate-summary'] });
    /*
      タスクの鍵も落とす。**ここに無かったので ⑤ の完了チェックが画面に出ていなかった**
      （「完了にしました」の札は出るのに行が変わらない。鍵が違うだけなので
       型検査にも lint にも出ない — この文書の頭に書いてある形そのもの）。
      工程の「3 / 7」は `gpm-project` 側が数えているので、そちらも一緒に落ちる。
    */
    qc.invalidateQueries({ queryKey: ['gpm', 'tasks'] });
    qc.invalidateQueries({ queryKey: ['gpm-project-tasks'] });
    /*
      BOX の中身も落とす（レビューでの指摘 #51 の案件側と同じ形）。
      **フォルダを作る前に読んだ結果**（「フォルダがまだ作られていません。」）は
      `staleTime: 60_000` で1分残るので、落とさないと**作った直後に
      「まだありません」と出たまま**になります。
    */
    qc.invalidateQueries({ queryKey: ['box-files'] });
    for (const id of ids) qc.invalidateQueries({ queryKey: gpmKeys.project(id) });
  };
}
