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
import type { GpmOpenItem, GpmProjectDetail, GpmProjectRow, GpmTemplate } from './types';

export const gpmKeys = {
  projects: (q: string) => ['gpm-projects', q] as const,
  project: (id: string) => ['gpm-project', id] as const,
  openItems: (status: string) => ['gpm-open-items', status] as const,
  templates: () => ['gpm-templates'] as const,
  users: () => ['gpm-users'] as const,
};

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

export function useGpmTemplates() {
  return useQuery<GpmTemplate[]>({
    queryKey: gpmKeys.templates(),
    queryFn: async () => (await api.get('/gpm/templates')).data.data,
  });
}

/** PM に選べる人＝`gpm` の権限を持っている人。持っていない人を選べても意味が無い */
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
    for (const id of ids) qc.invalidateQueries({ queryKey: gpmKeys.project(id) });
  };
}
