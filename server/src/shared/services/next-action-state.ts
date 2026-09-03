/**
 * **「未対応の次回アクション」が指す集合を1か所に集める**（migration 245）
 *
 * ── なぜ1か所にするか（実測）────────────────────────────────
 *
 * ⚠️ **同じ「未対応の次回アクション」が、口によって違う集合を指していました。**
 *
 * 判定式は7か所に写されていて、**終わった案件（失注・完了）を除く条件が
 * 入っていたのは2か所だけ**でした:
 *
 *   入っている   ホーム「次の一手」/ 受信箱の超過（`dashboard.routes.ts`）
 *                MCP `list_overdue_actions`
 *   入っていない 営業活動記録の「次にやること」パネル（`/activity-logs/upcoming`）
 *                同画面の `sort=next_action` 並べ替え
 *                MCP `list_activity_logs` の `upcoming:true`（projects を JOIN すらしていない）
 *                週報の「来週期限の未完了 next_action」
 *                顧客360°の `open_actions` 件数（`next_action_date IS NOT NULL` も欠落）
 *                夜間の短文生成の待ち行列（失注案件の分にも AI 費用を払っていた）
 *
 * ユーザーの報告はここから出ています —「失注になった案件については無条件で
 * 完了扱いにしてリストから落として欲しい」「これらがゴミとして溜まりまくっている」。
 *
 * ⚠️ **「入っていない5か所に条件を足す」では再発します。** 式が7本ある状態
 * そのものが食い違いの元なので、**全部の口がこの1本を読む**ようにします
 * （`billing-state.ts` が「入金待ち」で取ったのと同じ形）。
 */
import { queryAll } from '../db/connection';

/**
 * 終わった案件のステージ。**ここから出た案件の次回アクションは誰もやらない**。
 * `projects.stage` の値（`e_lost` = 失注 / `r_delivered` = 実施済・財務処理中 /
 * `s_completed` = 完了）。
 *
 * `r_delivered`（2026-09 追加）も含める — 実施が終われば営業側の「次の一手」は
 * もう無く、残るのは財務処理だけ。営業活動記録の次回アクションを機械的に閉じてよい
 * （BOX フォルダの `98_終了案件` 移動とは別の話 — あちらは `s_completed` だけで発火する）。
 */
export const TERMINAL_PROJECT_STAGES = ['r_delivered', 's_completed', 'e_lost'] as const;

/**
 * 未対応の次回アクション。**別名は `a` = `activity_logs` 固定**。
 *
 * `next_action_date IS NOT NULL` を必ず含めること — 期限の無いやることを
 * 「今日までのもの」として数えると、件数だけが増えて画面から辿れません
 * （顧客360°の `open_actions` が実際にそうなっていました）。
 */
export const NEXT_ACTION_OPEN_SQL = `a.deleted_at IS NULL
     AND a.next_action IS NOT NULL
     AND a.next_action_date IS NOT NULL
     AND a.next_action_done_at IS NULL`;

/**
 * 終わった案件を除く。**別名は `p` = `projects` 固定**。
 *
 * ⚠️ **`p.stage IS NULL` を必ず許すこと。** 活動記録は案件に紐づかないものがあり
 * （顧客だけに付いた記録）、`LEFT JOIN projects` では `p.stage` が NULL になります。
 * `p.stage NOT IN (...)` だけで書くと NULL は真にならないので、
 * **案件の無い記録が丸ごと消えます**（今まで出ていた「次にやること」が
 * 静かに減るだけなので、画面からは気づけません）。
 */
export const PROJECT_NOT_TERMINAL_SQL =
  `(p.stage IS NULL OR p.stage NOT IN (${TERMINAL_PROJECT_STAGES.map((s) => `'${s}'`).join(',')}))`;

/**
 * **これが「未対応の次回アクション」の正**。一覧・件数・並べ替え・週報・MCP は
 * すべてこれを読む（`a` = `activity_logs` / `p` = `projects` の別名が要る）。
 */
export const OPEN_NEXT_ACTION_SQL = `${NEXT_ACTION_OPEN_SQL}
     AND ${PROJECT_NOT_TERMINAL_SQL}`;

/**
 * `projects` を JOIN していない SQL 用の同じ条件（`EXISTS` 版）。
 *
 * 夜間の短文生成（`next-action-short.service.ts`）は `FROM activity_logs` を
 * 別名なしで書いていて JOIN を足すと待ち行列の数え方まで変わるため、
 * **条件だけをこの形で足す**。式の中身は `PROJECT_NOT_TERMINAL_SQL` と同じ意味。
 *
 * @param projectIdExpr 案件 id を指す式（別名なしなら `activity_logs.project_id`）
 */
export function projectNotTerminalExistsSql(projectIdExpr: string): string {
  return `NOT EXISTS (
      SELECT 1 FROM projects tp
       WHERE tp.id = ${projectIdExpr}
         AND tp.stage IN (${TERMINAL_PROJECT_STAGES.map((s) => `'${s}'`).join(',')})
    )`;
}

/**
 * 機械が次回アクションを閉じた理由（`activity_logs.next_action_auto_closed_reason`）。
 * **NULL は「人が押した完了」または「まだ未対応」**（migration 245 の頭注）。
 */
export const AUTO_CLOSE_REASON = {
  lost: 'project_lost',
  completed: 'project_completed',
} as const;

/** ステージ → 機械が閉じる理由。終了ステージでなければ `null` */
function autoCloseReasonForStage(toStage: string): string | null {
  if (toStage === 'e_lost') return AUTO_CLOSE_REASON.lost;
  // r_delivered（実施済・財務処理中）も「完了」と同じ理由で閉じる —
  // 営業側の次回アクションが指す「終わった」は財務処理の完了ではなく実施の完了
  if (toStage === 'r_delivered' || toStage === 's_completed') return AUTO_CLOSE_REASON.completed;
  return null;
}

/**
 * 案件が終了系ステージに入ったら、その案件の未対応の次回アクションを機械が閉じる。
 * **終了系から戻ったら、機械が閉じたものだけを開き直す。**
 *
 * ⚠️ **人が「完了」を押したものは絶対に触りません**（開き直す側の条件が
 * `next_action_auto_closed_reason IS NOT NULL`）。人が片づけたやることが
 * 案件を戻した拍子に復活すると、**やることが勝手に増える**ことになり、
 * 一覧そのものが信用されなくなります。
 *
 * @returns 実際に閉じた（または開き直した）行数
 */
export async function syncNextActionsForStage(projectId: string, toStage: string): Promise<number> {
  const reason = autoCloseReasonForStage(toStage);

  if (reason) {
    // 未対応のものだけを閉じる。**`next_action_date` は問わない** — 期限が
    // 決まっていないやることも、案件が終わればやらないことに変わりはない
    const rows = await queryAll(
      `UPDATE activity_logs
          SET next_action_done_at = NOW(),
              next_action_auto_closed_reason = ?,
              updated_at = NOW()
        WHERE project_id = ?
          AND deleted_at IS NULL
          AND next_action IS NOT NULL
          AND next_action_done_at IS NULL
        RETURNING id`,
      [reason, projectId],
    );
    return rows.length;
  }

  // 終了系から戻った。**機械が閉じたものだけ**を未対応に戻す
  const rows = await queryAll(
    `UPDATE activity_logs
        SET next_action_done_at = NULL,
            next_action_auto_closed_reason = NULL,
            updated_at = NOW()
      WHERE project_id = ?
        AND deleted_at IS NULL
        AND next_action_auto_closed_reason IS NOT NULL
      RETURNING id`,
    [projectId],
  );
  return rows.length;
}

/**
 * ステージ変更の本体を止めずに `syncNextActionsForStage` を呼ぶ。
 *
 * ⚠️ **ここで失敗しても案件のステージ変更は成功させる。** 次回アクションの
 * 後片づけは「見えるゴミが少し残る」だけの話で、**失注にできない・完了にできない**
 * ほうが業務は確実に止まります（記録の失敗で業務を止めない、という
 * この製品の他の後処理と同じ判断）。
 */
export async function syncNextActionsForStageSafe(projectId: string, toStage: string): Promise<number> {
  try {
    return await syncNextActionsForStage(projectId, toStage);
  } catch (e) {
    console.warn('[next-action-state] 次回アクションの自動開閉に失敗:', projectId, toStage, (e as Error).message);
    return 0;
  }
}
