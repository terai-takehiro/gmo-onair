/**
 * 月次 AI レビューの自動下書き — 段9（04-ai.md §5-5）。
 *
 * `scheduler.service.ts` の毎月1日 03:25 JST から呼ばれる。**AI は1回も呼ばない**
 * （既存の集計を読むだけ）。`ops_reports.kind='ai_review_production'` に1本作り、
 * `qsheet` の manager 全員へ通知する。担当者（`assignee_user_id`）は
 * `QSHEET_AI_REVIEW_OWNER_USER_ID` が設定されていれば1人を指名し、無ければ NULL のまま
 * （「未設定」として動く＝レビュー通知が個人名で飛ばないだけで、システムは壊れない）。
 *
 * 併せて、よく直されるフィールドの上位からナレッジの draft 案を機械的に作る
 * （§6-3 育て方1）。**`draft` のままなのでプロンプトにはまだ効かない** — 承認は人が行う。
 */
import { v4 as uuid } from 'uuid';
import { execute, queryAll, queryOne } from '../../../shared/db/connection';
import { getFeedbackDigest, type FeedbackDigest } from '../../../shared/services/ai-feedback.service';
import { perRowCost } from '../../../shared/services/ai-usage.service';
import { proposalStats, type ProposalStat } from './proposals.service';
import { draftAutoKnowledge } from './knowledge';
import {
  EVENT_PLAN_KIND, SCRIPT_OUTLINE_KIND, SCRIPT_LINE_KIND, PRODUCTION_CHAT_KIND, AI_REVIEW_PRODUCTION_KIND,
} from './kinds';
import type { NotifyInput } from '../../platform/services/notification.service';
import { usersWithPermission } from '../../platform/services/notification.service';

export const AI_REVIEW_JOB_KEY = 'ai_review_production_draft';
export const AI_REVIEW_NOTIFY_TEMPLATE_ID = 'qsheet_ai_review_draft';
/** 未設定なら NULL のまま（README §4 確認8: 名前をハードコードしない） */
const OWNER_ENV_VAR = 'QSHEET_AI_REVIEW_OWNER_USER_ID';

const REVIEW_KINDS = [EVENT_PLAN_KIND, SCRIPT_OUTLINE_KIND, SCRIPT_LINE_KIND, PRODUCTION_CHAT_KIND] as const;

/** 対象月（`YYYY-MM-DD` の前月）を `YYYY-MM` で返す。純関数（テスト対象） */
export function prevMonthPeriodKey(todayYmd: string): string {
  const [y, m] = todayYmd.split('-').map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, '0')}`;
}

/** `YYYY-MM` の日数（うるう年対応）。純関数（テスト対象） */
export function daysInMonth(periodKey: string): number {
  const [y, m] = periodKey.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // 翌月の0日目 = 当月末日
}

/**
 * よく直されるフィールドの上位から、ナレッジの draft 案を機械的に作る（§6-3 育て方1）。
 * **絶対値・割合とも小さいものは作らない**（母数3件未満は既存の作法どおり無視）。
 */
async function draftKnowledgeFromDigest(kind: string, digest: FeedbackDigest): Promise<number> {
  if (digest.reviewed_outputs < 3) return 0;
  let created = 0;
  for (const f of digest.top_corrected_field_types.slice(0, 3)) {
    const share = digest.reviewed_outputs > 0 ? f.corrections / digest.reviewed_outputs : 0;
    if (f.corrections < 3 || share < 0.3) continue;
    const pct = Math.round(share * 100);
    const body = `${f.field_path} はよく直される（直近${digest.window_days}日で${pct}%・` +
      `fix${f.fix}/enrich${f.enrich}/reject${f.reject}件）。生成時に特に注意すること。`;
    const rationale = `${kind} の月次集計（top_corrected_field_types）から機械的に作成。人が承認するまで効かない。`;
    const r = await draftAutoKnowledge({
      kind, segmentKey: null, body, rationale,
      evidence: { field_path: f.field_path, corrections: f.corrections, fix: f.fix, enrich: f.enrich, reject: f.reject, share },
    });
    if (r.created) created += 1;
  }
  return created;
}

interface KindSummary {
  kind: string;
  digest: FeedbackDigest;
  proposals: ProposalStat | null; // production_chat には提案テーブルが無い
  perRowUsd: number | null;
}

function bodyOf(periodKey: string, summaries: KindSummary[], recordLoss: number): string {
  const lines: string[] = [`# 制作資料 AI 月次レビュー ${periodKey}`, ''];
  for (const s of summaries) {
    const takeup = s.proposals && s.proposals.generated > 0
      ? `${Math.round((s.proposals.applied / s.proposals.generated) * 100)}%（${s.proposals.applied}/${s.proposals.generated}）`
      : '—';
    const asIs = s.digest.as_is_rate != null ? `${Math.round(s.digest.as_is_rate * 100)}%` : '—';
    lines.push(`## ${s.kind}`);
    lines.push(`- 取り込み率: ${takeup}`);
    lines.push(`- 無修正採用率: ${asIs}（レビュー件数 ${s.digest.reviewed_outputs}）`);
    if (s.digest.outline) {
      const o = s.digest.outline;
      lines.push(`- 尺の精度（AI初期値）: ${o.ai_duration_mape != null ? `${Math.round(o.ai_duration_mape * 100)}%` : '—'}`
        + `／実尺取得率 ${o.runs_measured}/${o.broadcasts_total}`);
    }
    if (s.digest.line) {
      const l = s.digest.line;
      lines.push(`- 生存率: ${l.lines_applied > 0 ? Math.round(((l.lines_applied - l.fixed - l.rejected) / l.lines_applied) * 100) : '—'}%`
        + `（fix${l.fixed}/reject${l.rejected}/rephrase${l.rephrased}）`);
    }
    if (s.digest.chat) {
      const c = s.digest.chat;
      lines.push(`- 起票率: ${c.spawn_rate != null ? `${Math.round(c.spawn_rate * 100)}%` : '—'}（${c.spawned}/${c.assistant_messages}）`);
    }
    lines.push(`- 1件あたり実費: ${s.perRowUsd != null ? `$${s.perRowUsd.toFixed(3)}` : '—'}`);
    lines.push('');
  }
  if (recordLoss > 0) {
    lines.push(`⚠️ 記録が欠けている提案が ${recordLoss} 件あります（ai_output_id が空・failed 以外）。条件1〜2の記録漏れの疑いがあります。`);
  }
  lines.push('', '## 決めること', '- ナレッジ案（draft）の承認・却下', '- プロンプトを直すか', '- is_reference を落とす台本があるか');
  return lines.join('\n');
}

/**
 * 月次ふりかえりの下書きを作る。**best-effort** — 途中で失敗しても
 * 呼び出し側（`scheduler.service.ts`）が例外を握りつぶし、他の夜間仕事を止めない。
 */
export async function buildMonthlyReviewDraft(periodKey: string): Promise<{ reportId: string; created: boolean; notify: NotifyInput[] }> {
  // 対象月ぶんの日数を window にする（03:25 JST・翌月1日に走るので、ほぼ暦月と一致する）
  const windowDays = daysInMonth(periodKey) + 1; // 1日の余裕（時差・実行遅延を吸収）

  const summaries: KindSummary[] = [];
  let knowledgeDrafted = 0;
  for (const kind of REVIEW_KINDS) {
    const digest = await getFeedbackDigest(kind, windowDays);
    const proposals = kind === PRODUCTION_CHAT_KIND
      ? null
      : (await proposalStats(windowDays)).find((p) => p.kind === kind) ?? { kind, generated: 0, applied: 0, discarded: 0, expired: 0 };
    const usageKind = kind === EVENT_PLAN_KIND ? 'event_plan'
      : kind === SCRIPT_OUTLINE_KIND ? 'script_outline'
      : kind === SCRIPT_LINE_KIND ? 'script_line' : 'production_chat';
    const cost = await perRowCost(usageKind, windowDays).catch(() => ({ usdPerRow: null }));
    summaries.push({ kind, digest, proposals, perRowUsd: cost.usdPerRow });
    if (kind !== PRODUCTION_CHAT_KIND) knowledgeDrafted += await draftKnowledgeFromDigest(kind, digest).catch(() => 0);
  }

  // F17: 記録が黙って切れていないかを見る（§6-5d）
  const lossRow = await queryOne(
    `SELECT COUNT(*) AS n FROM qsheet_ai_proposals
      WHERE created_at >= NOW() - (? || ' days')::interval
        AND ai_output_id IS NULL AND state <> 'failed'`,
    [String(windowDays)],
  ) as { n?: number } | undefined;
  const recordLoss = Number(lossRow?.n) || 0;

  const payload = {
    period_key: periodKey, window_days: windowDays,
    kinds: summaries.map((s) => ({ kind: s.kind, proposals: s.proposals, per_row_usd: s.perRowUsd,
      as_is_rate: s.digest.as_is_rate, reviewed_outputs: s.digest.reviewed_outputs,
      top_corrected_field_types: s.digest.top_corrected_field_types, by_model: s.digest.by_model,
      outline: s.digest.outline ?? null, line: s.digest.line ?? null, chat: s.digest.chat ?? null })),
    record_loss: recordLoss, knowledge_drafted: knowledgeDrafted,
  };
  const body = bodyOf(periodKey, summaries, recordLoss);
  const title = `制作資料 AI 月次レビュー ${periodKey}`;

  const ownerId = await resolveOwnerUserId();

  const existing = await queryOne(
    `SELECT id, status, reviewed_at FROM ops_reports
      WHERE kind = ? AND period_key = ? AND deleted_at IS NULL`,
    [AI_REVIEW_PRODUCTION_KIND, periodKey],
  ) as { id?: string; status?: string; reviewed_at?: string | null } | undefined;

  let reportId: string;
  let created: boolean;
  if (!existing) {
    reportId = uuid();
    await execute(
      `INSERT INTO ops_reports (id, kind, period_key, title, body, payload, status, assignee_user_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?::jsonb, 'draft', ?, NULL)`,
      [reportId, AI_REVIEW_PRODUCTION_KIND, periodKey, title, body, JSON.stringify(payload), ownerId],
    );
    created = true;
  } else {
    reportId = String(existing.id);
    // **人が読んで確定済みなら上書きしない**（下書き→確定の遷移を AI が覆さない。既存の作法と同じ）
    if (existing.status === 'published' || existing.reviewed_at) {
      created = false;
    } else {
      await execute(
        `UPDATE ops_reports SET title = ?, body = ?, payload = ?::jsonb,
                assignee_user_id = COALESCE(assignee_user_id, ?), updated_at = NOW()
          WHERE id = ?`,
        [title, body, JSON.stringify(payload), ownerId, reportId],
      );
      created = true; // 「今回作った/更新した」の意味で true
    }
  }

  // 通知は qsheet manager 全員へ（担当を個人名だけで通知しない・§5-5 手順2）。
  // ⚠️ **専用の閲覧画面は段9の範囲では作っていない**（`/daily/weekly/:id` は
  // kind='weekly_activity' 専用の画面で、流用すると週報の一覧に紛れて誤解を招く）。
  // link は空にし、通知本文だけで内容が伝わるようにする。閲覧画面は別 PR の課題として残す
  const managers = await usersWithPermission('qsheet', 'manager');
  const notify: NotifyInput[] = managers.map((userId) => ({
    userId, templateId: AI_REVIEW_NOTIFY_TEMPLATE_ID,
    title: `［AIレビュー］${periodKey} 分の下書きができました`,
    body: `${periodKey} の制作資料 AI のふりかえり下書きができました（ops_reports.kind=ai_review_production・id=${reportId}）。`,
    link: null, refType: 'ops_report', refId: reportId, refDate: periodKey,
  }));

  return { reportId, created, notify };
}

/**
 * 担当者ID（`QSHEET_AI_REVIEW_OWNER_USER_ID`）を解決する。設定が無い・存在しない id なら
 * NULL を返す（レビュー通知が個人名で飛ばないだけで、システムは壊れない。README §4 確認8）。
 */
async function resolveOwnerUserId(): Promise<string | null> {
  const id = (process.env[OWNER_ENV_VAR] || '').trim();
  if (!id) return null;
  const user = await queryOne('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [id]) as { id?: string } | undefined;
  if (!user) {
    console.warn(`[qsheet-ai] ${OWNER_ENV_VAR}=${id} に該当する利用者が見つかりません（未設定として扱います）`);
    return null;
  }
  return user.id ?? null;
}

/** 月次レビューの実施率（§5-5 手順3・条件5の計測）。直近N件のうち reviewed_at が付いている割合 */
export async function reviewCompletionRate(limit = 12): Promise<{ total: number; reviewed: number; rate: number | null }> {
  const rows = await queryAll(
    `SELECT reviewed_at FROM ops_reports
      WHERE kind = ? AND deleted_at IS NULL
      ORDER BY period_key DESC LIMIT ?`,
    [AI_REVIEW_PRODUCTION_KIND, limit],
  ) as { reviewed_at: string | null }[];
  const total = rows.length;
  const reviewed = rows.filter((r) => r.reviewed_at != null).length;
  return { total, reviewed, rate: total > 0 ? Math.round((reviewed / total) * 100) / 100 : null };
}

/** `scheduler.service.ts` から呼ぶ薄いラッパー。`today` は JST の `YYYY-MM-DD` */
export async function runMonthlyReviewIfDue(today: string): Promise<NotifyInput[]> {
  if (!today.endsWith('-01')) return []; // 毎月1日だけ（README の毎日15分ポーリングに乗せる）
  const periodKey = prevMonthPeriodKey(today);
  const { notify } = await buildMonthlyReviewDraft(periodKey);
  return notify;
}
