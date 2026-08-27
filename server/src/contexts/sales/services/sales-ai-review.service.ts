/**
 * 営業側の月次 AI レビューの自動下書き — docs/core-redesign-plan.md Phase 2 ②。
 *
 * 制作側の完成形（`qsheet/ai/monthly-review.service.ts`）と同じ作法:
 * `scheduler.service.ts` の毎月1日 03:35 JST から呼ばれ、**AI は1回も呼ばない**
 * （既存の digest 集計を読むだけ）。`ops_reports.kind='ai_review_sales'` に1本作り、
 * `sales` の manager 全員へ通知する。
 *
 * 制作側との違い（意図的なもの）:
 *  - ナレッジの draft 起こしはしない（営業側にはナレッジの器
 *    `qsheet_ai_knowledge` に当たるものがまだ無い。Phase 2 のナレッジ承認UIと同じく後続）。
 *  - 1件あたり実費は出さない — `ai_usage.kind` と `ai_outputs.kind` の語彙が
 *    一致していない（Phase 3「kind 語彙統一」の既知課題）ため、
 *    ここで手書きの対応表を作るとその表がまた別の正になってしまう。
 *  - link は `/settings/ai-activity`（AI活動ページ・クライアント側の担当と契約済みのパス）。
 *    制作側が link:null なのは閲覧画面がまだ無いためで、営業側は同じ轍を踏まない。
 */
import { v4 as uuid } from 'uuid';
import { execute, queryOne } from '../../../shared/db/connection';
import { getFeedbackDigest, type FeedbackDigest } from '../../../shared/services/ai-feedback.service';
// 対象月の計算は制作側の純関数をそのまま使う（書き写すとうるう年対応などが二重になる）
import { prevMonthPeriodKey, daysInMonth } from '../../qsheet/ai/monthly-review.service';
import type { NotifyInput } from '../../platform/services/notification.service';
import { usersWithPermission } from '../../platform/services/notification.service';
// kind は各サービスの定数を import する（文字列を書き写すと、kind を変えた日に
// 集計だけが黙って 0 件になる — `ai-feedback.service.ts` の MINUTES_KIND と同じ理由）
import { PROJECT_DRAFT_KIND } from './project-ai-feedback.service';
import { ACTIVITY_FORMAT_KIND } from './activity-log.service';
import { NEXT_ACTION_SHORT_KIND } from './next-action-short.service';
import { KPT_DRAFT_KIND } from './kpt.service';
import { MINUTES_KIND } from './minutes.service';
import {
  GPM_PROJECT_DRAFT_KIND, GPM_TASK_DRAFT_KIND,
} from '../../gpm/services/gpm-ai-feedback.service';
import {
  FINANCE_DOC_INTAKE_KIND, INQUIRY_INTAKE_KIND,
} from '../../dailyops/services/inbox-ai-feedback.service';

export const SALES_AI_REVIEW_KIND = 'ai_review_sales';
export const SALES_AI_REVIEW_JOB_KEY = 'sales_ai_review';
export const SALES_AI_REVIEW_NOTIFY_TEMPLATE_ID = 'sales_ai_review_draft';
/** 通知が押したときの行き先（AI活動ページ）。クライアント側の実装と対で決めたパス */
export const AI_ACTIVITY_LINK = '/settings/ai-activity';

/**
 * レビュー対象の営業系 kind（Phase 2 ②で決めた9種 ＋ プロジェクト管理の2種）。
 * `estimate_draft` / `task_intake` には専用の定数が無い（`aifeedback.tools.ts` の
 * KNOWN_KINDS と同じ理由でリテラルのまま）。**この一覧は
 * `shared/tests/salesAiReview.test.ts` が固定している** — 増減はテストごと直すこと。
 * プロジェクト管理（GPM）の2種を足したのは、`gpm` の権限が `sales` に統合されており
 * レビュー担当（営業マネージャー）が同じため。
 */
export const SALES_REVIEW_KINDS = [
  'task_intake',
  ACTIVITY_FORMAT_KIND,
  NEXT_ACTION_SHORT_KIND,
  MINUTES_KIND,
  KPT_DRAFT_KIND,
  PROJECT_DRAFT_KIND,
  'estimate_draft',
  INQUIRY_INTAKE_KIND,
  FINANCE_DOC_INTAKE_KIND,
  GPM_PROJECT_DRAFT_KIND,
  GPM_TASK_DRAFT_KIND,
] as const;

const pct = (v: number | null | undefined): string => (v == null ? '—' : `${Math.round(v * 100)}%`);

/** 1 kind ぶんの本文（Markdown の節）。数字が無いところは「—」で正直に出す */
function kindSection(kind: string, d: FeedbackDigest): string[] {
  const lines: string[] = [`## ${kind}`];
  lines.push(`- 無修正採用率: ${pct(d.as_is_rate)}（レビュー件数 ${d.reviewed_outputs}）`);
  for (const f of d.top_corrected_field_types.slice(0, 3)) {
    lines.push(`- よく直される: ${f.field_path}（${f.corrections}件・fix${f.fix}/enrich${f.enrich}/reject${f.reject}）`);
  }
  if (d.intake) {
    lines.push(`- 誤検知率: ${pct(d.intake.false_positive_rate)}（下書き${d.intake.drafts_total}件）`
      + `／期限内完了率: ${pct(d.intake.on_time_rate)}`);
  }
  if (d.inquiry) {
    lines.push(`- 見送り率: ${pct(d.inquiry.dropped_rate)}`
      + `（チケット${d.inquiry.ticket}/案件${d.inquiry.project}/ストック${d.inquiry.stock}/見送り${d.inquiry.dropped}）`);
  }
  if (d.outcomes) {
    lines.push(`- 成果: 受注${d.outcomes.won}件／失注${d.outcomes.lost}件／進行中${d.outcomes.in_progress}件`);
  }
  if (d.minutes) {
    lines.push(`- 持ち帰りの追跡率: ${pct(d.minutes.tracked_rate)}`
      + `（${d.minutes.open_items_tracked}/${d.minutes.open_items_total}・確定議事録${d.minutes.confirmed}件）`);
  }
  lines.push('');
  return lines;
}

function bodyOf(periodKey: string, summaries: Array<{ kind: string; digest: FeedbackDigest }>): string {
  const lines: string[] = [`# 営業 AI 月次レビュー ${periodKey}`, ''];
  for (const s of summaries) lines.push(...kindSection(s.kind, s.digest));
  lines.push(
    '## 決めること',
    '- 拾いすぎ（見送り率・誤検知率）へのプロンプト修正を入れるか',
    '- よく直されるフィールドの上位をメール取込スキルの指示に反映するか',
    '- prompt_version を上げて前後比較を始めるか',
  );
  return lines.join('\n');
}

/**
 * 月次ふりかえりの下書きを作る。**best-effort** — 途中で失敗しても
 * 呼び出し側（`scheduler.service.ts`）が例外を握りつぶし、他の夜間仕事を止めない。
 * 二重防止と「人が確定済みなら上書きしない」は制作側と同じ判断。
 */
export async function buildSalesReviewDraft(periodKey: string): Promise<{ reportId: string; created: boolean; notify: NotifyInput[] }> {
  // 対象月ぶんの日数 + 1日の余裕（時差・実行遅延を吸収。制作側と同じ）
  const windowDays = daysInMonth(periodKey) + 1;

  const summaries: Array<{ kind: string; digest: FeedbackDigest }> = [];
  for (const kind of SALES_REVIEW_KINDS) {
    summaries.push({ kind, digest: await getFeedbackDigest(kind, windowDays) });
  }

  const payload = {
    period_key: periodKey, window_days: windowDays,
    kinds: summaries.map((s) => ({
      kind: s.kind,
      reviewed_outputs: s.digest.reviewed_outputs, as_is_rate: s.digest.as_is_rate,
      top_corrected_field_types: s.digest.top_corrected_field_types, by_model: s.digest.by_model,
      intake: s.digest.intake ?? null, inquiry: s.digest.inquiry ?? null,
      outcomes: s.digest.outcomes ?? null, minutes: s.digest.minutes ?? null,
    })),
  };
  const body = bodyOf(periodKey, summaries);
  const title = `営業 AI 月次レビュー ${periodKey}`;

  const existing = await queryOne(
    `SELECT id, status, reviewed_at FROM ops_reports
      WHERE kind = ? AND period_key = ? AND deleted_at IS NULL`,
    [SALES_AI_REVIEW_KIND, periodKey],
  ) as { id?: string; status?: string; reviewed_at?: string | null } | undefined;

  let reportId: string;
  let created: boolean;
  if (!existing) {
    reportId = uuid();
    await execute(
      `INSERT INTO ops_reports (id, kind, period_key, title, body, payload, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?::jsonb, 'draft', NULL)`,
      [reportId, SALES_AI_REVIEW_KIND, periodKey, title, body, JSON.stringify(payload)],
    );
    created = true;
  } else {
    reportId = String(existing.id);
    // **人が読んで確定済みなら上書きしない**（下書き→確定の遷移を AI が覆さない）
    if (existing.status === 'published' || existing.reviewed_at) {
      created = false;
    } else {
      await execute(
        `UPDATE ops_reports SET title = ?, body = ?, payload = ?::jsonb, updated_at = NOW()
          WHERE id = ?`,
        [title, body, JSON.stringify(payload), reportId],
      );
      created = true; // 「今回作った/更新した」の意味で true（制作側と同じ）
    }
  }

  // 通知は sales の manager 全員へ（個人名で1人に寄せない。制作側と同じ判断）
  const managers = await usersWithPermission('sales', 'manager');
  const notify: NotifyInput[] = managers.map((userId) => ({
    userId, templateId: SALES_AI_REVIEW_NOTIFY_TEMPLATE_ID,
    title: `［AIレビュー］${periodKey} 分の営業 AI の下書きができました`,
    body: `${periodKey} の営業系 AI のふりかえり下書きができました。無修正採用率・見送り率・よく直されるフィールドを確認してください。`,
    link: AI_ACTIVITY_LINK, refType: 'ops_report', refId: reportId, refDate: periodKey,
  }));

  return { reportId, created, notify };
}

/** `scheduler.service.ts` から呼ぶ薄いラッパー。`today` は JST の `YYYY-MM-DD` */
export async function runSalesReviewIfDue(today: string): Promise<NotifyInput[]> {
  if (!today.endsWith('-01')) return []; // 毎月1日だけ（15分ポーリングに乗せる・制作側と同じ）
  const periodKey = prevMonthPeriodKey(today);
  const { notify } = await buildSalesReviewDraft(periodKey);
  return notify;
}
