/**
 * ウィークリー活動報告の AI 下書きボタン — 生成の口
 *
 * 画面の「AI下書きを作る」ボタン（`POST /dailyops/reports/:id/draft-ai`）から呼ばれる。
 * `weekly-stats.service`（集計）と `weekly-report-ai.service`（AI呼び出し）を束ね、
 * `ops-report.service`（保存）へ書き戻す。
 *
 * ⚠️ **この3サービスを1ファイルに同居させない**（循環 import を避ける）。
 * `weekly-stats.service` は `ops-report.service` の `normalizeWeekStart` 等を import
 * しているので、`ops-report.service` 側から `weekly-stats.service` を import すると輪になる。
 * ここは両方を「使う側」に立つので安全。
 *
 * ── 会社方針「AIを使い捨てにしない」（.claude/skills/ai-feedback-loop/）─────
 *
 *   条件1 記録   下書きの全文を `ai_outputs`(kind=`weekly_report_draft`) に
 *   条件2 差分   人が**確定した**ときにサーバーが自動比較 → `ai_corrections`
 *                （`ops-report.service.publishReport` 側。ここでは記録しない）
 *   条件3 成果   無修正確定率（`get_ai_feedback_digest` が既存の仕組みで計算する）
 *   条件4 還流   `get_ai_feedback_digest` の advice を次の下書きに載せる
 *   条件5 レビュー 月1回・日常業務のマネージャー（既存の運用の決めに乗る）
 */
import { AppError } from '../../../shared/middleware/errorHandler';
import { recordAiOutput } from '../../../shared/services/ai-output.service';
import { getFeedbackDigest } from '../../../shared/services/ai-feedback.service';
import { opsReportService, isReportLocked } from './ops-report.service';
import { getWeeklyStats } from './weekly-stats.service';
import {
  draftWeeklyReport, isWeeklyReportAiConfigured, WEEKLY_REPORT_DRAFT_KIND,
} from './weekly-report-ai.service';

export interface WeeklyReportDraftOutcome {
  report: Record<string, unknown>;
  aiCalled: boolean;
}

/**
 * AI に週報の本文を書かせて保存する。
 *
 * **確定済みの週報には書けない**（`assertReportOpen` と同じ規則。ここでは
 * `opsReportService.upsertReport` に任せるのではなく先に確認する — AI 呼び出しは
 * 費用が掛かるので、書けないと分かっているのに呼んでから捨てるのは避ける）。
 */
export async function generateWeeklyReportDraft(
  reportId: string, userId: string, userName?: string | null,
): Promise<WeeklyReportDraftOutcome> {
  const report = await opsReportService.getReportById(reportId);
  if (!report) throw new AppError(404, 'NOT_FOUND', 'レポートが見つかりません');
  if (report.kind !== 'weekly_activity') {
    throw new AppError(400, 'VALIDATION_ERROR', 'AI下書きはウィークリー活動報告だけで使えます');
  }
  if (isReportLocked(report)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'この週報は確定済みです。直すには「確定を取り消す」を押してください');
  }
  if (!isWeeklyReportAiConfigured()) {
    throw new AppError(503, 'NOT_CONFIGURED', 'この環境は AI につないでいないので、下書きは作れません');
  }

  const periodKey = String(report.period_key);
  const stats = await getWeeklyStats(periodKey);

  let advice: string[] = [];
  try {
    advice = (await getFeedbackDigest(WEEKLY_REPORT_DRAFT_KIND, 90)).advice ?? [];
  } catch { /* 助言が取れなくても続ける */ }

  const draft = await draftWeeklyReport(stats, advice);

  // AI が出したものの**全文**を残す（条件1）。人の確定時（publishReport）に
  // findLatestAiOutput で引き直して比べるので、ここで id を保持する必要はない
  await recordAiOutput({
    kind: WEEKLY_REPORT_DRAFT_KIND,
    targetTable: 'ops_reports',
    targetId: reportId,
    payload: { body: draft.body },
    toolName: 'dailyops.weekly-report-draft-button',
    model: draft.model,
    promptVersion: draft.promptVersion,
    actorId: userId,
  });

  // 既存の payload（隔週キープの凍結情報 `payload.keep` 等）は残し、`stats` だけ差し替える
  const existingPayload = (report.payload ?? {}) as Record<string, unknown>;
  await opsReportService.upsertReport({
    kind: 'weekly_activity',
    period_key: periodKey,
    body: draft.body,
    payload: { ...existingPayload, stats },
    // **押した人を requested_by に残す**。画面ヘッダーの「AI作成」バッジは
    // `created_by === 'mcp-claude' || !!requested_by` を見ているので、ボタンから
    // 生成したときもここを埋めないとバッジが出ない（MCP 経由と見分けが付かなくなる）
    requested_by: userName ?? null,
  });

  return { report: (await opsReportService.getReportById(reportId))!, aiCalled: true };
}
