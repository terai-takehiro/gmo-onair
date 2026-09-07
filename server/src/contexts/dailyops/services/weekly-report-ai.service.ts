/**
 * ウィークリー活動報告の AI 下書き（本文の文章化）
 *
 * ── なぜ AI に書かせるか ────────────────────────────────────
 *
 * 自動集計（`get_weekly_activity_stats` / `getWeeklyStats`）は数字の表でしかなく、
 * そのままでは「先週なにがあったか」が読み取りにくい。数字は既にサーバーが
 * 正しく集計しているので、AI の仕事は**数字を作ることではなく、数字を文章にすること**に絞る。
 *
 * ── いちばん危ないこと ──────────────────────────────────────
 *
 * **材料に無い数字を書くこと**。週報は全社が読み、読む人は自動集計の表と
 * 本文を1つずつ突き合わせない（議事録・KPT と同じ理由で heavy 固定 — `ai-model.ts`）。
 * だからプロンプトで「材料に書かれている数字だけを使う・無ければ触れない」を繰り返し禁じる。
 */
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { resolveProvider, type IntakeAiProvider } from '../../tasks/services/intake-ai.service';
import { recordAiUsage } from '../../../shared/services/ai-usage.service';
import { modelFor, tierFor } from '../../../shared/services/ai-model';
import type { WeeklyStats } from './weekly-stats.service';

/** `ai_outputs.kind`。publish 時の差分記録・`get_ai_feedback_digest` の両方が使う */
export const WEEKLY_REPORT_DRAFT_KIND = 'weekly_report_draft';

export const WEEKLY_REPORT_PROMPT_VERSION = 'weekly-report-v1';
export const WEEKLY_REPORT_PROMPT_VERSION_WITH_FEEDBACK = 'weekly-report-v1+fb';

const TIMEOUT_MS = 90_000;

const WeeklySchema = z.object({
  body: z.string().describe(
    '週報の本文（Markdown）。見出しは付けず、段落か箇条書きで '
    + '新規案件・営業活動・パイプライン・売上・今週/来週のイベント・来週期限のやることを '
    + '材料にある範囲でまとめる',
  ),
});

const SYSTEM_PROMPT = `あなたは制作会社の営業事務です。
ウィークリー活動報告のための自動集計（数字の表）を読み、全社が読む本文の下書きを書きます。
人がこれを直して確定します。

## 絶対に守ること

1. **材料に書かれていない数字・出来事を書かない。** 「たぶんこうだったはず」は禁止です。
   材料に載っていない項目は触れないでください。**埋めるために作らないこと。**
2. **金額・件数は材料の値をそのまま使う。** 四捨五入や言い換えで数字を変えないでください。
3. **案件名・お客様名は材料の表記のまま**にします（省略形を作らない）。
4. **評価や感想を書かない。** 「好調です」「厳しい週でした」のような総括は不要です。
   事実（件数・金額・予定）だけを書きます。
5. **Markdown の見出し（#）は使わない。** アプリ側が見出しを別に出すので、本文は
   段落と箇条書きだけにします。
6. 材料が乏しい区分（新規案件が0件など）は「新規案件はありませんでした」のように
   短く触れる程度でよく、無理に文章を膨らませないでください。`;

export interface WeeklyReportDraftResult {
  body: string;
  provider: IntakeAiProvider;
  model: string;
  promptVersion: string;
}

export function isWeeklyReportAiConfigured(): boolean {
  return resolveProvider() !== null;
}

/** ウィークリー活動報告の下書きに使うモデル。**常に heavy**（`ai-model.ts` の表） */
export function weeklyReportModel(provider?: IntakeAiProvider | null): string {
  const p = provider ?? resolveProvider();
  if (!p) return 'none';
  return modelFor('weekly_report', tierFor('weekly_report'), p);
}

const num = (v: number): string => v.toLocaleString('ja-JP');
const yen = (v: number): string => `${num(v)}円`;

/** 集計 (`WeeklyStats`) を AI に渡す文字にする。純関数（素で試せる） */
export function buildSourceText(stats: WeeklyStats): string {
  const parts: string[] = [];
  parts.push(`## 対象週\n${stats.period.week_start} 〜 ${stats.period.week_end}`);

  parts.push(`\n## 新規案件（${stats.new_projects.count}件・うちAI起票${stats.new_projects.ai_count}件）`);
  for (const p of stats.new_projects.items as Array<Record<string, unknown>>) {
    parts.push(`- ${String(p.name ?? '')}（${String(p.customer_name ?? 'お客様不明')}）`);
  }

  parts.push(`\n## 営業活動（${stats.activities.count}件・うちAI取込${stats.activities.ai_count}件）`);
  for (const t of stats.activities.by_type as Array<Record<string, unknown>>) {
    parts.push(`- ${String(t.activity_type ?? '')}: ${String(t.count ?? 0)}件`);
  }

  parts.push('\n## パイプライン現況（フェーズ別・受注前後を問わず進行中の案件）');
  for (const s of stats.pipeline as Array<Record<string, unknown>>) {
    parts.push(`- ${String(s.stage ?? '')}: ${String(s.count ?? 0)}件（見込み ${yen(Number(s.expected_amount ?? 0))}）`);
  }

  parts.push(`\n## 売上\n- 週内: ${yen(stats.revenue.week_total)}\n- 当月累計 (${stats.revenue.month}): ${yen(stats.revenue.month_total)}`);

  parts.push(`\n## 今週のイベント（${stats.events_this_week.length}件）`);
  for (const e of stats.events_this_week as Array<Record<string, unknown>>) {
    parts.push(`- ${String(e.name ?? '')}（${String(e.customer_name ?? 'お客様不明')}）${String(e.event_start ?? '')}〜${String(e.event_end ?? '')}`);
  }

  parts.push(`\n## 来週のイベント（${stats.next_week.events.length}件）`);
  for (const e of stats.next_week.events as Array<Record<string, unknown>>) {
    parts.push(`- ${String(e.name ?? '')}（${String(e.customer_name ?? 'お客様不明')}）${String(e.event_start ?? '')}〜${String(e.event_end ?? '')}`);
  }

  parts.push(`\n## 来週期限の未対応アクション（${stats.next_week.next_actions.length}件）`);
  for (const a of stats.next_week.next_actions as Array<Record<string, unknown>>) {
    parts.push(`- ${String(a.next_action ?? '')}（${String(a.project_name ?? '')}・担当 ${String(a.user_name ?? '')}・期限 ${String(a.next_action_date ?? '')}）`);
  }

  return parts.join('\n');
}

export async function draftWeeklyReport(
  stats: WeeklyStats, advice: string[] = [],
): Promise<WeeklyReportDraftResult> {
  const provider = resolveProvider();
  if (!provider) throw new Error('OPENAI_API_KEY / ANTHROPIC_API_KEY のどちらも未設定です');
  const model = weeklyReportModel(provider);

  const lessons = advice.slice(0, 8);
  const lessonBlock = lessons.length
    ? `\n## 前回までの傾向（人があなたの下書きをどう直したか）
実測値です。同じ間違いを繰り返さないでください。
ただし**材料に無いことを補ってはいけません**。傾向は書き方にだけ使うこと。
${lessons.map((l) => `- ${l}`).join('\n')}\n`
    : '';

  const userPrompt = `${lessonBlock}${buildSourceText(stats)}`;

  const out = provider === 'openai'
    ? await callOpenAi(model, userPrompt)
    : await callAnthropic(model, userPrompt);

  await recordAiUsage({
    kind: 'weekly_report', provider, model,
    inputTokens: out.usage.inputTokens,
    cachedInputTokens: out.usage.cachedInputTokens,
    outputTokens: out.usage.outputTokens,
  });

  const body = typeof (out.raw as { body?: unknown })?.body === 'string'
    ? (out.raw as { body: string }).body.trim()
    : '';

  return {
    body,
    provider,
    model,
    promptVersion: lessons.length ? WEEKLY_REPORT_PROMPT_VERSION_WITH_FEEDBACK : WEEKLY_REPORT_PROMPT_VERSION,
  };
}

interface DraftCall { raw: unknown; usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number } }

function readUsage(raw: unknown): DraftCall['usage'] {
  const u = (raw ?? {}) as Record<string, unknown>;
  const det = (u.input_tokens_details ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);
  return {
    inputTokens: n(u.input_tokens),
    cachedInputTokens: n(det.cached_tokens) || n(u.cache_read_input_tokens),
    outputTokens: n(u.output_tokens),
  };
}

async function callOpenAi(model: string, userPrompt: string): Promise<DraftCall> {
  const client = new OpenAI({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const response = await client.responses.parse({
    model,
    instructions: SYSTEM_PROMPT,
    input: userPrompt,
    text: { format: zodTextFormat(WeeklySchema, 'weekly_report_draft') },
  });
  if (response.status === 'incomplete') {
    throw new Error(`下書きが途中で終わりました: ${response.incomplete_details?.reason ?? '理由不明'}`);
  }
  const parsed = response.output_parsed;
  if (!parsed) throw new Error(`下書きの結果を読み取れませんでした (status=${response.status ?? '不明'})`);
  return { raw: parsed, usage: readUsage(response.usage) };
}

async function callAnthropic(model: string, userPrompt: string): Promise<DraftCall> {
  const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const response = await client.messages.parse({
    model,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low', format: zodOutputFormat(WeeklySchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });
  if (response.stop_reason === 'refusal') {
    throw new Error(`下書きが拒否されました: ${response.stop_details?.explanation ?? '理由不明'}`);
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new Error('下書きの結果を読み取れませんでした');
  return { raw: parsed, usage: readUsage(response.usage) };
}
