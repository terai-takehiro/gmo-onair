/**
 * やり取りの1件を直す（保存・完了・延期・次のアクションの削除）— 案件詳細
 *
 * ── なぜ1か所にまとめるか ──────────────────────────────────
 *
 * 触る口が4つ（`PUT /activity-logs/:id` ＋ 完了・延期の2つ）あり、**どれも
 * 落とす鍵が同じ**です。カードごとに書くと、どれか1つで
 * `['project', projectId]` を落とし忘れ、**概要タブの「次のアクション」だけが
 * 古いまま残ります**（保存したのに直っていないように見える、いちばん困る壊れ方）。
 *
 * ── `PUT` は全項目の置き換え（いちばんの落とし穴）────────────
 *
 * サーバーの `update()` は `project_id` / `customer_id` / `activity_type` /
 * `activity_date` / `subject` / `description` / `next_action` /
 * `next_action_date` を**渡された値でそのまま上書き**します（`|| null`）。
 * 1つでも送り忘れると、**その項目が黙って消えます**。そこで
 * `fullPayload()` が**いま表示している行の全項目**を組み立て、
 * 直したところだけを上に重ねます。**この関数を通さずに `api.put` を書かないこと。**
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { addDaysToDateStr, localDateStr } from '@gmo-onair/shared/src/client/format';
import type { ActivityLog } from '../types';

/** 直すところだけ。**ここに無い項目は今の値がそのまま送られる** */
export interface ActivityPatch {
  activity_type?: string;
  activity_date?: string;
  subject?: string;
  description?: string | null;
  next_action?: string | null;
  next_action_date?: string | null;
  /** 手動で編集した本文（許可タグだけの HTML）。サーバーがもう一度削る */
  body_html?: string | null;
  /**
   * AI が作った構造を捨てる印。**`null` を明示で送る**ときだけ意味を持つ
   * （サーバーは `data.body_struct !== undefined` で判定している）。
   */
  body_struct?: null;
  /** 次のアクションを削除するときの理由（**任意**・3択＋自由記入） */
  next_action_delete_reason?: string;
}

/**
 * `PUT` に送る本体を組み立てる。**全項目を必ず入れる**（このファイルの冒頭）。
 *
 * `project_id` は行の値を優先し、無ければ開いている案件に落とします
 * （案件詳細から開いている以上、この案件の記録であることは確かなので、
 * 行の値が欠けていても紐づけを切らない）。
 */
function fullPayload(a: ActivityLog, projectId: string, patch: ActivityPatch) {
  return {
    project_id: a.project_id ?? projectId,
    customer_id: a.customer_id ?? null,
    activity_type: a.activity_type ?? 'other',
    activity_date: a.activity_date,
    subject: a.subject,
    description: a.description ?? null,
    next_action: a.next_action ?? null,
    next_action_date: a.next_action_date ?? null,
    ...patch,
  };
}

/** 明日（`YYYY-MM-DD`）。**ローカルで作る** — UTC に起こすと JST の朝が前日になる */
export const tomorrowStr = (): string => addDaysToDateStr(localDateStr(new Date()), 1);
/** 1週間後 */
export const nextWeekStr = (): string => addDaysToDateStr(localDateStr(new Date()), 7);

export function useThreadEdit(projectId: string) {
  const qc = useQueryClient();

  /**
   * 落とす鍵。**概要タブ（`['project', projectId]`）も必ず落とす** —
   * あちらの「次のアクション」の帯は同じ行を読んでいるので、
   * 落とさないと**削除したはずのやることが概要に残り続けます**。
   */
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['project-activities', projectId] });
    qc.invalidateQueries({ queryKey: ['project', projectId] });
    // 営業活動記録（案件別・一覧）も同じ行を並べている。
    // **案件別（`activity-by-project`）も必ず落とす** — 落とさないと、やり取りタブで
    // 削除したやることが案件別の一覧に残る。チップの件数は一覧と同じ返り（`summary`）に
    // 乗っているので、この鍵1つで一覧とチップの両方が新しくなる
    // （旧 `activity-by-project-counts` は #727 の宿題①で廃止・`activityLog/byProject.ts` の末尾）
    qc.invalidateQueries({ queryKey: ['activity-logs'] });
    qc.invalidateQueries({ queryKey: ['activity-upcoming'] });
    qc.invalidateQueries({ queryKey: ['activity-by-project'] });
  };

  const save = useMutation({
    mutationFn: (p: { a: ActivityLog; patch: ActivityPatch; }) =>
      api.put(`/activity-logs/${p.a.id}`, fullPayload(p.a, projectId, p.patch)),
    onSuccess: (_r, p) => {
      invalidate();
      /*
       * ⚠️ **元から無かったものを「削除しました」と言わない**（実ブラウザで見つけた穴）。
       *
       * 編集の枠は「次のアクション」の欄を**常に**持つので、もともと次のアクションが
       * 無い記録の本文だけを直して保存すると `patch.next_action` は空文字で届きます。
       * 空文字だけを見ていたため、**何も消していないのに「次のアクションを削除しました」**と
       * 出ていました（`docs/wording.md`「状態と関係なく出す表示は嘘になる」）。
       * 削除と言ってよいのは**元の行が実際に持っていたとき**だけです。
       */
      const had = !!String(p.a.next_action ?? '').trim();
      notifySuccess(had && p.patch.next_action === '' ? '次のアクションを削除しました' : '保存しました');
    },
    onError: (e) => notifyApiError('保存できませんでした', e),
  });

  const complete = useMutation({
    mutationFn: (id: string) => api.post(`/activity-logs/${id}/complete-next-action`),
    onSuccess: () => { invalidate(); notifySuccess('次のアクションを完了にしました'); },
    onError: (e) => notifyApiError('完了にできませんでした', e),
  });

  const postpone = useMutation({
    mutationFn: (p: { id: string; date: string }) =>
      api.post(`/activity-logs/${p.id}/postpone-next-action`, { date: p.date }),
    onSuccess: () => { invalidate(); notifySuccess('期限を延期しました'); },
    onError: (e) => notifyApiError('延期できませんでした', e),
  });

  return {
    save: (a: ActivityLog, patch: ActivityPatch) => save.mutate({ a, patch }),
    /**
     * 次のアクションの削除。**空文字を送る**とサーバーが `null` に落とし、
     * `ai_corrections` に `reject` を1行積みます（会社方針の条件2）。
     * 期限も一緒に落とす — やることが無いのに期限だけ残ると、
     * 一覧の「期限超過」に中身の無い行が並びます。
     */
    deleteNextAction: (a: ActivityLog, reason: string) => save.mutate({
      a,
      patch: {
        next_action: '',
        next_action_date: null,
        ...(reason.trim() ? { next_action_delete_reason: reason.trim() } : {}),
      },
    }),
    complete: (id: string) => complete.mutate(id),
    postpone: (id: string, date: string) => postpone.mutate({ id, date }),
    isPending: save.isPending || complete.isPending || postpone.isPending,
  };
}

export type ThreadEdit = ReturnType<typeof useThreadEdit>;
