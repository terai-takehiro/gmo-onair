// 投入テキストの解析 (LLM) — 「誰に / 何を / いつまでに」を読み取る。
//
// 要件: docs/requirements/2026-07-25-collaboration-and-personal-agent.md (D4 / D9)
//
// **対応プロバイダは OpenAI と Anthropic の 2 つ。**
//   スキーマ・プロンプト・出力の後段検証はプロバイダ共通にしてある。
//   差し替えても「存在しない id を捨てる」「壊れた期限を不明に倒す」といった
//   安全側の処理は同じように効くので、乗り換えのコストと事故の余地を小さくしている。
//   選択は環境変数 (下の resolveProvider) で、キーを入れたほうが自動で使われる。
//
// なぜ LLM を主経路にするのか:
//   朝会メモや議事録の文は崩れている (体言止め・主語省略・複数依頼が 1 行に混在)。
//   規則ベース (intake-parser.service.ts) は定型文には強いが、崩れた文では
//   「拾えなかった」が増える。拾えなかった依頼は結局口頭のまま消えるので、
//   ここは解析精度がそのまま要件の達成度になる。
//   一方で **API キーが無い / API が落ちている環境でも投入口は動かないと困る**ため、
//   規則ベースをフォールバックとして残し、呼び出し側 (route) が縮退する。
//
// GMO イズムに従う点 (プロンプトに契約として書く):
//   - 目標達成10カ条 1-1「期限は何日何時何分まで」→ 分まで出させる。
//     「今週中」「なるべく早く」は **勝手に日付を決めさせない** (due_unclear=true)。
//     勝手に決めると曖昧なまま確定したことになり、イズムに反する。
//   - 同 1-1「期限はできるだけ短く」→ 遠い期限は呼び出し側が注意を添える。
//   - 同 2-3「会話だけでなく、形に残さないとメンバーは動かない」
//     → 期限が読めない文も **捨てない**。下書きにして人に聞く。
//   - 会議術10カ条 7「議事録には ToDo・期限・次回開催日を記載」
//     → 議事録は正当な投入源。ただし決定事項はタスクにしない (溢れるため)。
//
// 改善の測定 (開発の絶対原則):
//   model と prompt_version を ai_outputs に記録する。プロンプトを変えたときに
//   「無修正採用率が上がったか」を prompt_version 別に比較できるようにするため。

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import * as z from 'zod/v4';
import { suggestUrgency, type ParsedDraft, type ParseResult, type ParserUser } from './intake-parser.service';

/** プロンプトを変えたら必ず上げる。ai_outputs.prompt_version に入り、改善効果の比較単位になる */
export const INTAKE_PROMPT_VERSION = 'task-intake-v1';

export type IntakeAiProvider = 'openai' | 'anthropic';

/**
 * 既定モデル。
 * どちらも**上位モデルを既定にしている**。ここで読み落とすと依頼が口頭のまま消えるので、
 * この機能ではコストより解析精度を優先する。1 日に数件〜十数件の投入なので費用は小さい。
 * コストを詰めたい場合は INTAKE_AI_MODEL で mini 系に下げられる。
 */
const DEFAULT_MODELS: Record<IntakeAiProvider, string> = {
  openai: 'gpt-5.4',
  anthropic: 'claude-opus-5',
};

/** 解析は対話 UI の中で待たせるので、nginx の 60 秒より十分手前で諦める */
const TIMEOUT_MS = 30_000;

/** 投入テキストの上限。これを超える分は切らずに **エラーにして人に分けさせる** (黙って切ると依頼が消える) */
const MAX_INPUT_CHARS = 20_000;

/**
 * 使うプロバイダを決める。
 * INTAKE_AI_PROVIDER で明示指定でき、無指定ならキーが入っているほうを使う。
 * 両方あるときは OpenAI を優先する (運用でこちらを主に使う想定)。
 * どちらも無ければ null = 規則ベースに縮退する。
 */
let warnedUnknownProvider = false;

export function resolveProvider(): IntakeAiProvider | null {
  const forced = (process.env.INTAKE_AI_PROVIDER ?? '').trim().toLowerCase();
  if (forced === 'openai') return process.env.OPENAI_API_KEY ? 'openai' : null;
  if (forced === 'anthropic') return process.env.ANTHROPIC_API_KEY ? 'anthropic' : null;
  if (forced && !warnedUnknownProvider) {
    // 綴り間違いで黙って別のプロバイダが使われると原因が分からなくなるので必ず言う
    warnedUnknownProvider = true;
    console.warn(
      `[intake-ai] INTAKE_AI_PROVIDER="${forced}" は未対応です (openai | anthropic)。` +
      'キーが入っているプロバイダを自動選択します。'
    );
  }
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}

export function isIntakeAiConfigured(): boolean {
  return resolveProvider() !== null;
}

export function intakeAiModel(provider?: IntakeAiProvider | null): string {
  const p = provider ?? resolveProvider();
  if (!p) return 'rules';
  return process.env.INTAKE_AI_MODEL || DEFAULT_MODELS[p];
}

// ── 出力スキーマ ────────────────────────────────────────────
// 不明を null ではなく空文字で表す。null 許容は JSON Schema 変換で
// type: ["string","null"] になり strict モードの扱いがモデル・SDK 版で揺れるため、
// 「空文字 = 不明」の 1 系統に寄せて崩れる余地を消す。

const DraftSchema = z.object({
  title: z.string().describe('やること。宛先・期限・敬称を含めず、動詞で終わる短い文にする。例「見積書の作成」'),
  assignee_id: z.string().describe('担当者の users.id。一覧に無い / 特定できないときは空文字'),
  assignee_name_raw: z.string().describe('文中に書かれていた宛先の表記。読めなければ空文字。例「佐藤さん」「隣の席の人」'),
  assignee_unclear: z.boolean().describe('宛先が特定できなかったら true'),
  due_at: z.string().describe('期限。"YYYY-MM-DD HH:mm" 形式。読めない / 曖昧なら空文字。勝手に日付を作らない'),
  due_time_assumed: z.boolean().describe('日付だけ書かれていて時刻を 18:00 で補ったら true'),
  due_unclear: z.boolean().describe('期限が書かれていない、または「今週中」「なるべく早く」のように曖昧なら true'),
  importance: z.number().describe('重要度 1(低) 2(中) 3(高)。判断できなければ 2'),
  urgency: z.number().describe('緊急度 1(低) 2(中) 3(高)。判断できなければ 2'),
  quote: z.string().describe('根拠になった投入テキストの該当部分をそのまま引用する'),
});

const SkippedSchema = z.object({
  line: z.string().describe('タスクにしなかった行の原文'),
  reason: z.string().describe('なぜタスクにしなかったかを日本語 1 文で。例「決定事項なのでタスクにしませんでした」'),
});

/** export しているのは検証スクリプトから JSON Schema 変換を確認できるようにするため */
export const IntakeResultSchema = z.object({
  drafts: z.array(DraftSchema),
  skipped: z.array(SkippedSchema),
});

// ── プロンプト ───────────────────────────────────────────────

const SYSTEM_PROMPT = `あなたは制作会社の業務アシスタントです。
朝会のメモ・議事録・ひとことメモから「誰に / 何を / いつまでに」を読み取り、タスクの下書きを作ります。

## 必ず守ること

1. **期限は「何月何日何時何分まで」で書く。**
   「金曜まで」のように日付だけのときは 18:00 を補い due_time_assumed=true にする。
   「今週中」「来週中」「なるべく早く」「至急」「そのうち」のような曖昧な表現は、
   **絶対に日付を推測しない**。due_at は空文字にして due_unclear=true にする。
   曖昧な期限を勝手に確定させることは、この会社では明確に誤りです。

2. **期限が読めない依頼も捨てない。** 下書きに入れて due_unclear=true にする。
   捨てると口頭のまま忘れられるので、それがこの仕組みで一番避けたいことです。

3. **決定事項・報告・共有はタスクにしない。** skipped に理由付きで入れる。
   例「方針は A 案で進めることに決定」→ タスクではない。
   ただし「決まったので○○を作る」のように**やることが含まれていればタスクにする**。

4. **1 行に複数の依頼があれば分けて出す。** 逆に、複数行が 1 つの依頼を説明しているならまとめる。

5. **担当者は渡されたユーザー一覧の id だけを使う。** 一覧に無い名前は
   assignee_id を空文字、assignee_name_raw に文中の表記、assignee_unclear=true にする。
   「隣の席の人」「営業チーム」「各自」のような表現も特定できないものとして扱う。
   **一覧に無い id を作ってはいけません。**

6. **title に宛先・期限・敬称・「お願いします」を含めない。** やることだけを短く書く。

7. **重要度**は内容から判断する (経営判断・顧客提出・請求は高め、社内の整理は低め)。
   判断できなければ 2。**緊急度**は期限の近さで決める。判断できなければ 2。

8. 見出しだけの行 (「朝会メモ」「■ 共有事項」など) は skipped に入れる。

やることが 1 つも読み取れない場合は drafts を空配列にしてください。無理に作らないこと。`;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

function describeNow(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}(${WEEKDAY_JA[now.getDay()]}) ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function buildUserPrompt(text: string, users: ParserUser[], now: Date, submitterId?: string | null): string {
  const roster = users.length
    ? users.map((u) => `- ${u.id} : ${u.name}${u.id === submitterId ? '（この文を投入した人）' : ''}`).join('\n')
    : '(登録ユーザーなし)';
  return `現在の日時: ${describeNow(now)}
相対的な日付（「明日」「金曜」「来週月曜」など）はこの日時を基準に解決してください。

## 担当者として使えるユーザー一覧（この id 以外は使わない）
${roster}

## 投入されたテキスト
"""
${text}
"""`;
}

// ── 実行 ────────────────────────────────────────────────────

const DUE_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

function clamp3(v: unknown, fallback = 2): number {
  // null / undefined / '' を Number() に通すと 0 や NaN になり、
  // 0 は clamp で 1 (最低) に落ちてタスクが最下位に埋もれる。値が無いなら中央に寄せる。
  if (v === null || v === undefined || v === '') return fallback;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(3, Math.max(1, n));
}

/** これより先の期限は「長い」とみなす (イズム: 期限は短く)。規則ベースと同じ閾値 */
const LONG_DUE_DAYS = 14;

export interface IntakeAiResult extends ParseResult {
  provider: IntakeAiProvider;
  model: string;
  promptVersion: string;
}

/** LLM が返した生の形 (検証前) */
export interface RawAiResult {
  drafts?: {
    title?: unknown; assignee_id?: unknown; assignee_name_raw?: unknown;
    assignee_unclear?: unknown; due_at?: unknown; due_time_assumed?: unknown;
    due_unclear?: unknown; importance?: unknown; urgency?: unknown; quote?: unknown;
  }[];
  skipped?: { line?: unknown; reason?: unknown }[];
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * LLM の出力を検証・正規化する。**そのまま信じない**。
 *
 * 特に assignee_id は、存在しない id を作られると FK 違反や誤配になるため必ず突合する。
 * 期限も形式が壊れていたら「期限不明」に寄せる (壊れた値で確定させない)。
 * この関数はネットワークに触らないので単体で検証できる。
 */
export function normalizeAiResult(parsed: RawAiResult, users: ParserUser[], now: Date): ParseResult {
  const userIds = new Set(users.map((u) => u.id));

  const drafts: ParsedDraft[] = (parsed.drafts ?? [])
    .filter((d) => str(d?.title).length > 0)
    .map((d) => {
      const rawId = str(d.assignee_id);
      const idOk = rawId.length > 0 && userIds.has(rawId);
      const rawDue = str(d.due_at);
      const dueOk =
        DUE_RE.test(rawDue) && !Number.isNaN(new Date(rawDue.replace(' ', 'T')).getTime());
      const dueAt = dueOk ? rawDue : null;
      const dueFar = dueAt
        ? (new Date(dueAt.replace(' ', 'T')).getTime() - now.getTime()) / 86400000 > LONG_DUE_DAYS
        : false;
      return {
        title: str(d.title),
        assigned_to: idOk ? rawId : null,
        assignee_name_raw: str(d.assignee_name_raw) || null,
        assignee_unclear: !idOk,
        due_at: dueAt,
        due_time_assumed: dueAt ? Boolean(d.due_time_assumed) : false,
        due_unclear: !dueAt || Boolean(d.due_unclear),
        due_far: dueFar,
        importance: clamp3(d.importance),
        // 緊急度は期限が読めているなら期限からの決まった写像で出す (要件 D2)。
        // 規則ベースと同じ関数を使うことで AI 経路と規則経路で値がぶれず、
        // ai_corrections の集計が経路をまたいで比較できる。
        urgency: dueAt ? suggestUrgency(dueAt, now) : clamp3(d.urgency),
        quote: str(d.quote) || str(d.title),
      };
    });

  const skipped = (parsed.skipped ?? [])
    .filter((s) => str(s?.line).length > 0)
    .map((s) => ({ line: str(s.line), reason: str(s.reason) || 'タスクではないと判断しました' }));

  return { drafts, skipped };
}

/**
 * Claude API で投入テキストを解析する。
 * 失敗時は throw する (呼び出し側が規則ベースにフォールバックする)。
 */
export async function parseIntakeWithAi(
  text: string,
  users: ParserUser[],
  opts: { now?: Date; submitterId?: string | null } = {}
): Promise<IntakeAiResult> {
  const provider = resolveProvider();
  if (!provider) {
    throw new Error('OPENAI_API_KEY / ANTHROPIC_API_KEY のどちらも未設定です');
  }
  if (text.length > MAX_INPUT_CHARS) {
    throw new Error(`投入テキストが長すぎます (${text.length} 文字)。分けて投入してください`);
  }

  const now = opts.now ?? new Date();
  const model = intakeAiModel(provider);
  const userPrompt = buildUserPrompt(text, users, now, opts.submitterId);

  const raw = provider === 'openai'
    ? await callOpenAi(model, userPrompt)
    : await callAnthropic(model, userPrompt);

  const normalized = normalizeAiResult(raw, users, now);
  return { ...normalized, provider, model, promptVersion: INTAKE_PROMPT_VERSION };
}

/** OpenAI (Responses API + structured output) */
async function callOpenAi(model: string, userPrompt: string): Promise<RawAiResult> {
  const client = new OpenAI({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const response = await client.responses.parse({
    model,
    instructions: SYSTEM_PROMPT,
    input: userPrompt,
    text: { format: zodTextFormat(IntakeResultSchema, 'task_intake') },
  });

  // 途中で打ち切られた / 拒否された場合は output_parsed が null になる。
  // 中途半端な結果で確定させたくないので投げて規則ベースに縮退させる。
  if (response.status === 'incomplete') {
    throw new Error(`解析が途中で終わりました: ${response.incomplete_details?.reason ?? '理由不明'}`);
  }
  const parsed = response.output_parsed;
  if (!parsed) throw new Error(`解析結果を読み取れませんでした (status=${response.status ?? '不明'})`);
  return parsed as RawAiResult;
}

/** Anthropic (Messages API + structured output) */
async function callAnthropic(model: string, userPrompt: string): Promise<RawAiResult> {
  const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const response = await client.messages.parse({
    model,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    // 抽出タスクなので低めで十分。対話 UI の待ち時間を優先する
    output_config: { effort: 'low', format: zodOutputFormat(IntakeResultSchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error(`解析が拒否されました: ${response.stop_details?.explanation ?? '理由不明'}`);
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new Error('解析結果を読み取れませんでした');
  return parsed as RawAiResult;
}
