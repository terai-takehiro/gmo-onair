/**
 * 投入テキストの解析 (行動提案) — 「この文は ONAiR のどの操作になるか」を読み取る。
 *
 * 従来の intake-ai.service.ts は **タスクだけ**を読み取っていた。実際に投げられる文には
 * 「新規の引き合い」「見積を出したい」「スタジオを押さえたい」が混ざっていて、
 * そのうちタスクに見える部分だけが残り、他は要約すら残らずに落ちていた。
 * ここでは ONAiR の操作カタログ (action-catalog.ts) から選ばせる。
 *
 * ── 出力スキーマを「平たい 1 種類」にした理由 ──────────────────
 *
 * 操作ごとに形の違うオブジェクト (discriminated union) にするのが素直だが、
 * structured output の strict モードでの `anyOf` の扱いはモデル・SDK 版で揺れる。
 * 投入口が落ちると依頼が口頭のまま消えるので、ここは**揺れない形**を選ぶ:
 * 全操作で同じ 1 種類のオブジェクトを使い、使わない欄は空文字にする。
 * 「どの欄がその操作に要るか」は action-catalog.ts の requires が持っていて、
 * 足りない欄はサーバー側 (normalizeActions) が「人に聞くこと」に落とす。
 *
 * ── null ではなく空文字を使う理由 ──────────────────────────
 *
 * intake-ai.service.ts と同じ。null 許容は JSON Schema 変換で
 * type: ["string","null"] になり strict の扱いが揺れるため「空文字 = 不明」に寄せる。
 *
 * ── 勝手に決めさせないもの ────────────────────────────────
 *
 * 期限・日付・金額を推測で埋めさせない (GMO イズム 1-1: 曖昧な期限を使わない)。
 * 読めないものは空にして `asks` に「人に聞くこと」として上げる。
 * 特に **GLS 発番は番号を1本消費して取り消せない**ので、文に明示されていない限り
 * 提案してはいけないことをプロンプトの契約として書く。
 *
 * 改善の測定 (開発の絶対原則):
 *   model と prompt_version を ai_outputs に記録する。プロンプトを変えたときに
 *   「無修正で実行された率」を prompt_version 別に比較できるようにするため。
 */

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import * as z from 'zod/v4';
import {
  ACTION_CATALOG, ACTION_KINDS, describeCatalogForPrompt, isActionKind, type ActionKind,
} from './action-catalog';
import { resolveProvider, type IntakeAiProvider } from './intake-ai.service';

/** プロンプトを変えたら必ず上げる。ai_outputs.prompt_version に入り、改善効果の比較単位になる */
export const ACTION_PROMPT_VERSION = 'ai-actions-v1';
/** 過去の修正傾向を載せた回の版名 (載せた回と載せていない回を比較するため分ける) */
export const ACTION_PROMPT_VERSION_WITH_FEEDBACK = 'ai-actions-v1+fb';

/** 既定モデル。読み落とすと業務そのものが落ちるので精度側に振る */
const DEFAULT_MODELS: Record<IntakeAiProvider, string> = {
  openai: 'gpt-5.4',
  anthropic: 'claude-opus-5',
};

/**
 * 解析は対話 UI の中で待たせる。タスクだけの解析より読む量が多いので
 * 従来の 30 秒より長くとるが、nginx の 60 秒より手前で必ず諦める。
 */
const TIMEOUT_MS = 50_000;

/** 投入テキストの上限。超える分は切らずにエラーにする (黙って切ると依頼が消える) */
const MAX_INPUT_CHARS = 20_000;

/** 1 回の投入で出せる行動案の上限。これ以上並ぶと人が確認しきれない */
const MAX_ACTIONS = 12;

/**
 * 使うモデル。
 * 行動提案はタスク抽出より判断が要るので、タスク側だけを mini に落としても
 * こちらは別に指定できるようにしておく (ACTION_AI_MODEL)。
 * 未指定なら投入欄の設定 (INTAKE_AI_MODEL) → 既定モデル の順で解決する。
 */
export function actionAiModel(provider?: IntakeAiProvider | null): string {
  const p = provider ?? resolveProvider();
  if (!p) return 'rules';
  return process.env.ACTION_AI_MODEL || process.env.INTAKE_AI_MODEL || DEFAULT_MODELS[p];
}

// ── 出力スキーマ ────────────────────────────────────────────

const EstimateItemSchema = z.object({
  description: z.string().describe('品目名。例「カメラオペレーター」「ワールドスタジオ 基本料」'),
  quantity: z.number().describe('数量。読めなければ 1'),
  unit: z.string().describe('単位。「人日」「日」「式」など。読めなければ空文字'),
  unit_price: z.number().describe('単価 (円・税抜)。原文に無ければ 0 にする (推測で埋めない)'),
  cost_amount: z.number().describe('この行で外部に払う見込み額 (円)。分からなければ 0'),
  category: z.string().describe('スタジオ / 技術・人員 / 制作・その他 のいずれか。分からなければ空文字'),
});

const ActionSchema = z.object({
  kind: z.enum(ACTION_KINDS as [ActionKind, ...ActionKind[]])
    .describe('実行する ONAiR の操作'),
  title: z.string()
    .describe('案件名 / やること / 活動の件名。その操作の「名前」になるもの。不要なら空文字'),
  text: z.string()
    .describe('本文・要約・メモ。長い説明はここに入れる。不要なら空文字'),
  customer_id: z.string().describe('お客様の id。渡された一覧に無ければ空文字'),
  customer_name: z.string().describe('文中に書かれていたお客様の表記。読めなければ空文字'),
  project_id: z.string().describe('対象案件の id。渡された一覧に無ければ空文字'),
  project_ref: z.string().describe('文中に書かれていた案件の表記 (案件名 / GLS番号)。読めなければ空文字'),
  assignee_id: z.string().describe('担当者の users.id。渡された一覧に無ければ空文字'),
  assignee_name: z.string().describe('文中に書かれていた宛先の表記。読めなければ空文字'),
  due_at: z.string().describe('期限。"YYYY-MM-DD HH:mm"。読めない / 曖昧なら空文字 (勝手に決めない)'),
  date: z.string().describe('日付 (実施日 / 活動日 / 会議日)。"YYYY-MM-DD"。読めなければ空文字'),
  date_end: z.string().describe('終了日。"YYYY-MM-DD"。1日なら空文字'),
  amount: z.number().describe('金額 (円・税抜)。原文に無ければ 0 (推測で埋めない)'),
  stage: z.string()
    .describe('ステージ。neta / d_hold / c_proposal / b_verbal / a_won / s_completed / e_lost のいずれか。不要なら空文字'),
  gls_category: z.string().describe('案件分類。A=スタジオを使う / B=使わない。分からなければ空文字'),
  activity_type: z.string().describe('活動種別。visit / meeting / call / email / other。不要なら空文字'),
  next_action: z.string().describe('次にやること (活動記録用)。不要なら空文字'),
  next_action_date: z.string().describe('次にやることの期限 "YYYY-MM-DD"。読めなければ空文字'),
  importance: z.number().describe('重要度 1(低) 2(中) 3(高)。判断できなければ 2'),
  urgency: z.number().describe('緊急度 1(低) 2(中) 3(高)。判断できなければ 2'),
  estimate_items: z.array(EstimateItemSchema)
    .describe('見積の明細。create_estimate 以外では空配列にする'),
  minutes_decisions: z.array(z.string())
    .describe('議事録の決定事項。upsert_meeting_minutes 以外では空配列にする'),
  quote: z.string().describe('根拠になった投入テキストの該当部分をそのまま引用する'),
  confidence: z.number().describe('この提案の確からしさ 0.0〜1.0'),
  asks: z.array(z.string())
    .describe('実行する前に人に聞くこと (読めなかった項目)。無ければ空配列'),
});

const SkippedSchema = z.object({
  line: z.string().describe('操作にしなかった行の原文'),
  reason: z.string().describe('なぜ操作にしなかったかを日本語 1 文で'),
});

/** export しているのは検証スクリプトから JSON Schema 変換を確認できるようにするため */
export const ActionPlanSchema = z.object({
  summary: z.string().describe('この投入が何の話かを日本語 1 文で。行動案が 0 件でもこれは必ず書く'),
  actions: z.array(ActionSchema),
  skipped: z.array(SkippedSchema),
});

// ── プロンプト ───────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `あなたは制作会社 GMO グローバルスタジオの業務アシスタントです。
投げられたテキスト (朝会メモ・議事録・メール・ひとことメモ) を読み、
社内システム「GMO ONAiR」に対して**何をすべきか**を行動案として出します。

## 選べる操作

${describeCatalogForPrompt()}

## 必ず守ること

1. **要約で終わらせない。** 読んだ内容を ONAiR の操作に落とすのがあなたの仕事です。
   「○○社から新規の相談が来た」は要約ではなく create_project (と必要なら create_customer) です。
   ただし**操作が 1 つも無い文もある** (単なる報告・共有)。その場合は actions を空配列にし、
   summary と skipped だけ返してください。無理に操作をひねり出さないこと。

2. **1 つの文から複数の操作が出るのが普通です。** 例:
   「A社から9/10の配信の相談。まずスタジオ仮押さえして、山田さんに明日18時までに見積作成を頼んだ」
   → create_project (A社の配信案件) / create_studio_booking (9/10) / create_task (山田さんに見積作成)
   順番は「先に無いと後が成立しないもの」を前に置いてください
   (お客様 → 案件 → その案件に対する見積・予約・ステージ)。

3. **id は渡された一覧にあるものだけを使う。** 一覧に無いお客様・案件・担当者は
   id を空文字にし、文中の表記を customer_name / project_ref / assignee_name に入れ、
   asks に「どの○○か選んでください」と書いてください。**一覧に無い id を作ってはいけません。**

4. **期限・日付・金額を推測で埋めない。**
   「金曜まで」のように日付だけのときは 18:00 を補ってよい。
   「今週中」「なるべく早く」「至急」「そのうち」のような曖昧な表現は
   **絶対に日付を推測しない**。空文字にして asks に上げること。
   金額も原文に無ければ 0 のままにする。曖昧なものを勝手に確定させるのは、この会社では明確に誤りです。

5. **issue_gls (GLS発番) は、文に「発番する」「番号を出す」と明示されているときだけ提案する。**
   番号を 1 本消費して取り消せません。「受注した」「決まった」だけでは提案しないこと
   (それは change_project_stage です)。

6. **change_project_stage は対象の案件が一覧にあるときだけ提案する。**
   ステージの意味: neta=ネタ / d_hold=仮押さえ / c_proposal=見積提案 /
   b_verbal=口頭決定 / a_won=受注 / s_completed=完了 / e_lost=失注。

7. **append_project_note を「その他」の受け皿にしない。** 他の操作に当てはまらない
   内容はそこに逃がさず skipped に入れてください。メモが読まれなくなるのを防ぐためです。

8. **決定事項・報告・共有そのものは操作にしない。** skipped に理由付きで入れる。
   ただし「決まったので○○を作る」のように**やることが含まれていれば操作にする**。

9. quote には必ず根拠になった原文の該当部分を入れてください。人が確認するときに要ります。

10. confidence は正直に付けてください。読み取りに自信が無いものを 0.9 にすると、
    人が確認せずに通してしまい事故になります。`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

function describeNow(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `(${WEEKDAY_JA[now.getDay()]}) ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** 助言としてプロンプトに載せる行数の上限。長くしても効かず入力を膨らませるだけ */
const MAX_ADVICE_LINES = 8;

export interface PlanContext {
  users: { id: string; name: string }[];
  customers: { id: string; name: string }[];
  projects: { id: string; name: string; gls_number: string | null; customer_name: string | null; stage: string }[];
  rooms: { id: string; name: string }[];
}

export function buildUserPrompt(
  text: string,
  ctx: PlanContext,
  now: Date,
  submitterId?: string | null,
  advice?: string[],
): string {
  const users = ctx.users.length
    ? ctx.users.map((u) => `- ${u.id} : ${u.name}${u.id === submitterId ? '（この文を投入した人）' : ''}`).join('\n')
    : '(登録ユーザーなし)';
  const customers = ctx.customers.length
    ? ctx.customers.map((c) => `- ${c.id} : ${c.name}`).join('\n')
    : '(登録なし)';
  const projects = ctx.projects.length
    ? ctx.projects
      .map((p) => `- ${p.id} : ${p.name}${p.gls_number ? ` [${p.gls_number}]` : ''}` +
        `${p.customer_name ? ` (${p.customer_name})` : ''} 現在=${p.stage}`)
      .join('\n')
    : '(該当なし)';
  const rooms = ctx.rooms.length
    ? ctx.rooms.map((r) => `- ${r.id} : ${r.name}`).join('\n')
    : '(登録なし)';

  // 過去に人がどう直したかを渡す。これが**ループを閉じている部分**で、
  // プロンプトを書き換えなくても次の解析から傾向が効く (開発の絶対原則の条件4)。
  const lessons = (advice ?? []).slice(0, MAX_ADVICE_LINES);
  const lessonBlock = lessons.length
    ? `\n## 前回までの傾向（人があなたの出力をどう直したか）
以下は実測値です。同じ間違いを繰り返さないように踏まえてください。
ただし**原文に書かれていないことを補ってはいけません**。傾向は判断の重み付けにだけ使うこと。
${lessons.map((l) => `- ${l}`).join('\n')}\n`
    : '';

  return `現在の日時: ${describeNow(now)}
相対的な日付（「明日」「金曜」「来週月曜」など）はこの日時を基準に解決してください。

## 担当者として使えるユーザー（この id 以外は使わない）
${users}

## お客様（この id 以外は使わない。無ければ create_customer を提案する）
${customers}

## 案件（この id 以外は使わない。無ければ create_project を提案する）
${projects}

## スタジオの部屋（予約で部屋を指すときに使う）
${rooms}
${lessonBlock}
## 投入されたテキスト
"""
${text}
"""`;
}

// ── 正規化 ──────────────────────────────────────────────────

const DUE_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STAGES = ['neta', 'd_hold', 'c_proposal', 'b_verbal', 'a_won', 's_completed', 'e_lost'];
const ACTIVITY_TYPES = ['visit', 'meeting', 'call', 'email', 'other'];
const ESTIMATE_CATEGORIES = ['スタジオ', '技術・人員', '制作・その他'];

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function int(v: unknown, fallback = 0): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
}

function clamp3(v: unknown, fallback = 2): number {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(3, Math.max(1, n));
}

function clamp01(v: unknown, fallback = 0.5): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

export interface EstimateItemDraft {
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  cost_amount: number;
  category: string | null;
}

/** 検証・正規化を通った 1 件の行動案 */
export interface ActionDraft {
  /** 差分突合用の安定キー (サーバーが a1, a2, … で振る) */
  action_key: string;
  kind: ActionKind;
  title: string;
  text: string | null;
  customer_id: string | null;
  customer_name: string | null;
  project_id: string | null;
  project_ref: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  due_at: string | null;
  date: string | null;
  date_end: string | null;
  amount: number;
  stage: string | null;
  gls_category: 'A' | 'B' | null;
  activity_type: string | null;
  next_action: string | null;
  next_action_date: string | null;
  importance: number;
  urgency: number;
  estimate_items: EstimateItemDraft[];
  minutes_decisions: string[];
  quote: string | null;
  confidence: number;
  /** 人に聞くこと (AI が上げたもの + サーバーが足りないと判断したもの) */
  asks: string[];
  /** 確認画面の既定チェック状態。足りないものがある / 取り消せない操作は OFF */
  suggested_default: boolean;
  /**
   * 同じ投入の中で**先に作るお客様**を使う。
   *
   * AI は「これから作るお客様」の id を知り得ないので、
   * 「A社から相談 → 案件をつくる」を提案すると案件側の customer_id は必ず空になる。
   * これを「読み取れなかった」として扱うと、まだ存在しないお客様を人に選ばせる
   * ことになり、この機能の一番普通の使い方 (新規の引き合い) が毎回止まる。
   * 実行器は先に作った id を引き継ぐので、印を付けて聞かないようにする。
   */
  from_previous_customer: boolean;
  /** 同じ投入の中で**先に作る案件**を使う (理由は上と同じ) */
  from_previous_project: boolean;
}

export interface RawAction { [k: string]: unknown }
export interface RawPlan {
  summary?: unknown;
  actions?: RawAction[];
  skipped?: { line?: unknown; reason?: unknown }[];
}

export interface ActionPlanResult {
  summary: string;
  actions: ActionDraft[];
  skipped: { line: string; reason: string }[];
  provider: IntakeAiProvider;
  model: string;
  promptVersion: string;
}

/**
 * LLM の出力を検証・正規化する。**そのまま信じない。**
 *
 * 特に id は、存在しないものを作られると FK 違反や誤登録になるため必ず突合する。
 * 期限・日付も形式が壊れていたら落として「人に聞くこと」に回す
 * (壊れた値で確定させない)。この関数はネットワークに触らないので単体で検証できる。
 */
export function normalizeActions(parsed: RawPlan, ctx: PlanContext): {
  summary: string;
  actions: ActionDraft[];
  skipped: { line: string; reason: string }[];
} {
  const userIds = new Set(ctx.users.map((u) => u.id));
  const customerIds = new Set(ctx.customers.map((c) => c.id));
  const projectIds = new Set(ctx.projects.map((p) => p.id));

  const actions: ActionDraft[] = [];
  // ここまでに「作る」提案が出ているか。後続の提案が id を空で返してきたときに
  // 「読み取れなかった」ではなく「先に作るものを使う」と解釈するための状態
  const creates = { customer: false, project: false };

  for (const raw of parsed.actions ?? []) {
    const kind = str(raw.kind);
    // 知らない操作は捨てる。実行できないものを画面に出すと「押しても何も起きない」になる
    if (!isActionKind(kind)) continue;

    const spec = ACTION_CATALOG[kind];
    const asks: string[] = (Array.isArray(raw.asks) ? raw.asks : [])
      .map((a) => str(a))
      .filter((a) => a.length > 0);

    const customerId = str(raw.customer_id);
    const projectId = str(raw.project_id);
    const assigneeId = str(raw.assignee_id);
    const rawDue = str(raw.due_at);
    const rawDate = str(raw.date);
    const rawDateEnd = str(raw.date_end);
    const rawStage = str(raw.stage);
    const rawCategory = str(raw.gls_category).toUpperCase();
    const rawActivity = str(raw.activity_type).toLowerCase();
    const rawNextDate = str(raw.next_action_date);

    const draft: ActionDraft = {
      action_key: `a${actions.length + 1}`,
      kind,
      title: str(raw.title),
      text: str(raw.text) || null,
      customer_id: customerIds.has(customerId) ? customerId : null,
      customer_name: str(raw.customer_name) || null,
      project_id: projectIds.has(projectId) ? projectId : null,
      project_ref: str(raw.project_ref) || null,
      assignee_id: userIds.has(assigneeId) ? assigneeId : null,
      assignee_name: str(raw.assignee_name) || null,
      due_at: DUE_RE.test(rawDue) && !Number.isNaN(Date.parse(rawDue.replace(' ', 'T'))) ? rawDue : null,
      date: DATE_RE.test(rawDate) && !Number.isNaN(Date.parse(rawDate)) ? rawDate : null,
      date_end: DATE_RE.test(rawDateEnd) && !Number.isNaN(Date.parse(rawDateEnd)) ? rawDateEnd : null,
      amount: Math.max(0, int(raw.amount)),
      stage: STAGES.includes(rawStage) ? rawStage : null,
      gls_category: rawCategory === 'A' || rawCategory === 'B' ? rawCategory : null,
      activity_type: ACTIVITY_TYPES.includes(rawActivity) ? rawActivity : null,
      next_action: str(raw.next_action) || null,
      next_action_date: DATE_RE.test(rawNextDate) ? rawNextDate : null,
      importance: clamp3(raw.importance),
      urgency: clamp3(raw.urgency),
      estimate_items: (Array.isArray(raw.estimate_items) ? raw.estimate_items : [])
        .map((it) => {
          const o = (it ?? {}) as Record<string, unknown>;
          const cat = str(o.category);
          const qty = Number(o.quantity);
          return {
            description: str(o.description),
            quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
            unit: str(o.unit) || null,
            unit_price: Math.max(0, int(o.unit_price)),
            cost_amount: Math.max(0, int(o.cost_amount)),
            category: ESTIMATE_CATEGORIES.includes(cat) ? cat : null,
          };
        })
        .filter((it) => it.description.length > 0),
      minutes_decisions: (Array.isArray(raw.minutes_decisions) ? raw.minutes_decisions : [])
        .map((d) => str(d))
        .filter((d) => d.length > 0),
      quote: str(raw.quote) || null,
      confidence: clamp01(raw.confidence),
      asks,
      suggested_default: false,
      // 先に作るものを使うか。次の 2 つを**両方**満たすときだけ立てる:
      //   1. この提案より前に「作る」提案がある (後ろだと実行時にまだ存在しない)
      //   2. AI が id を**空で返している** (これから作るものを指しているとき空になる)
      // id が入っていたのに一覧と突き合わせできなかった場合は、AI が別の
      // 実在しない何かを指している (取り違え) ので繋いではいけない。
      // 繋ぐと「B社の件」と書かれた提案が、いま作った A社の案件に当たってしまう。
      from_previous_customer: customerId === '' && creates.customer,
      from_previous_project: projectId === '' && creates.project,
    };

    // 足りないものをサーバー側でも確かめる。
    // **AI が asks を書き忘れても既定 ON にならない**ようにするため、
    // ここで requires を突合して不足を asks に足す (画面の判断はこの結果を見る)。
    for (const need of spec.requires) {
      if (isProvided(draft, need)) continue;
      // 先に作るもので埋まる分は聞かない (まだ存在しないものを選ばせない)
      if (need === 'customer_id' && draft.from_previous_customer) continue;
      if (need === 'project_id' && draft.from_previous_project) continue;
      const label = ASK_LABEL[need] ?? need;
      if (!asks.some((a) => a.includes(label))) asks.push(`${label}が読み取れませんでした`);
    }

    // 既定チェック: 足りないものが無く、取り消せない操作でもないときだけ ON。
    // 「確認せず流す」を防ぐため、確からしさが低いものも OFF にする。
    draft.suggested_default = asks.length === 0 && !spec.optOut && draft.confidence >= 0.6;
    actions.push(draft);

    if (kind === 'create_customer') creates.customer = true;
    if (kind === 'create_project') creates.project = true;

    if (actions.length >= MAX_ACTIONS) break;
  }

  const skipped = (parsed.skipped ?? [])
    .filter((s) => str(s?.line).length > 0)
    .map((s) => ({ line: str(s.line), reason: str(s.reason) || '操作にはならないと判断しました' }));

  return { summary: str(parsed.summary), actions, skipped };
}

/** requires のキーごとの「入っているか」判定。列名とキーが違うものはここで吸収する */
function isProvided(d: ActionDraft, key: string): boolean {
  switch (key) {
    case 'title': return d.title.length > 0;
    case 'text': return !!d.text;
    case 'customer_id': return !!d.customer_id;
    case 'customer_name': return !!d.customer_name;
    case 'project_id': return !!d.project_id;
    case 'assignee_id': return !!d.assignee_id;
    case 'gls_category': return !!d.gls_category;
    case 'stage': return !!d.stage;
    case 'date': return !!d.date;
    case 'due_at': return !!d.due_at;
    case 'activity_type': return !!d.activity_type;
    case 'estimate_items': return d.estimate_items.length > 0;
    default: return false;
  }
}

/** 人に見せる項目名 (asks に出る文言) */
const ASK_LABEL: Record<string, string> = {
  title: '名前',
  text: '内容',
  customer_id: 'お客様',
  customer_name: 'お客様の名前',
  project_id: '案件',
  assignee_id: '担当者',
  gls_category: '案件分類 (スタジオ / ビジネス)',
  stage: 'ステージ',
  date: '日付',
  due_at: '期限',
  activity_type: '活動の種別',
  estimate_items: '見積の明細',
};

// ── 実行 ────────────────────────────────────────────────────

/**
 * 投入テキストから行動案を作る。
 * 失敗時は throw する (呼び出し側がタスクだけの規則ベース解析に縮退する)。
 */
export async function planActionsWithAi(
  text: string,
  ctx: PlanContext,
  opts: { now?: Date; submitterId?: string | null; advice?: string[] } = {},
): Promise<ActionPlanResult> {
  const provider = resolveProvider();
  if (!provider) {
    throw new Error('OPENAI_API_KEY / ANTHROPIC_API_KEY のどちらも未設定です');
  }
  if (text.length > MAX_INPUT_CHARS) {
    throw new Error(`投入テキストが長すぎます (${text.length} 文字)。分けて投入してください`);
  }

  const now = opts.now ?? new Date();
  const model = actionAiModel(provider);
  const userPrompt = buildUserPrompt(text, ctx, now, opts.submitterId, opts.advice);

  const raw = provider === 'openai'
    ? await callOpenAi(model, userPrompt)
    : await callAnthropic(model, userPrompt);

  const normalized = normalizeActions(raw, ctx);
  const promptVersion = (opts.advice?.length ?? 0) > 0
    ? ACTION_PROMPT_VERSION_WITH_FEEDBACK
    : ACTION_PROMPT_VERSION;
  return { ...normalized, provider, model, promptVersion };
}

/** OpenAI (Responses API + structured output) */
async function callOpenAi(model: string, userPrompt: string): Promise<RawPlan> {
  const client = new OpenAI({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const response = await client.responses.parse({
    model,
    instructions: buildSystemPrompt(),
    input: userPrompt,
    text: { format: zodTextFormat(ActionPlanSchema, 'ai_action_plan') },
  });

  // 途中で打ち切られた / 拒否された場合は output_parsed が null になる。
  // 中途半端な行動案で人に確認させると事故るので投げて縮退させる。
  if (response.status === 'incomplete') {
    throw new Error(`解析が途中で終わりました: ${response.incomplete_details?.reason ?? '理由不明'}`);
  }
  const parsed = response.output_parsed;
  if (!parsed) throw new Error(`解析結果を読み取れませんでした (status=${response.status ?? '不明'})`);
  return parsed as RawPlan;
}

/** Anthropic (Messages API + structured output) */
async function callAnthropic(model: string, userPrompt: string): Promise<RawPlan> {
  const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    // タスクだけの抽出より判断が要る (どの操作にするか) ので effort を上げる
    output_config: { effort: 'medium', format: zodOutputFormat(ActionPlanSchema) },
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: userPrompt }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error(`解析が拒否されました: ${response.stop_details?.explanation ?? '理由不明'}`);
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new Error('解析結果を読み取れませんでした');
  return parsed as RawPlan;
}
