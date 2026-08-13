/**
 * やり取りの「整えて記録する」— 打ちっぱなしの文 → 件名・状態・事実・発言・次にやること
 *
 * ── なぜ人に整えさせないか ──────────────────────────────────
 *
 * 電話を切った直後に書けるのは、たいてい**箇条書きにもなっていない走り書き**です。
 * ここで「件名」「本文」「次のアクション」の3つの欄を出すと、
 * **書くのが面倒になって記録そのものが残らなくなります**。
 * 人は打ちっぱなしで良い形にして、**形にするのは保存時に AI がやる**ことにしました。
 *
 * ── v2 で HTML を返させるのをやめた（migration 188）────────────
 *
 * v1 は `body_html` を1本返させていました。実際の取込メールは
 * **先方の言ったことと当社が答えたことが交互に並ぶやり取り**なのに、
 * 1本の HTML にすると**どちらの発言かは文の中にしか残りません**。
 * v2 は**意味の単位**（状態・事実・発言）を返させ、
 * **見せ方は画面が決めます**（`shared/services/activity-struct.ts`）。
 *
 * これで「AI に HTML を書かせない」という取込側の決めごと
 * （`rich-content.ts` の冒頭）と、やり取り側の作りが揃いました。
 *
 * ── 議事録との違い ──────────────────────────────────────────
 *
 * 議事録（`minutes-ai.service`）は**取引先との合意の記録**なので、
 * 決定事項に引用を必須にし、言い切れないものは持ち帰りへ落とします。
 * こちらは**社内の記録**で、材料も1人が書いた短い文です。
 * 守ることは同じで**書かれていないことを足さない** — ただし
 * 落とすのではなく「読み取れなければ空にする」形にします。
 *
 * ── AI に返る仕組み（会社方針「AI を使い捨てにしない」）────────
 *
 *   条件1 記録   原文と整形結果を `ai_outputs`(kind=`activity_format`) に全文で
 *   条件2 差分   人が直して保存したときにサーバーが自動比較 → `ai_corrections`
 *   条件3 成果   「次にやること」が期限内に済んだか（`next_action_done_at` から導出）
 *   条件4 還流   `get_ai_feedback_digest` の advice を次の整形プロンプトに載せる
 *   条件5 レビュー 月1回・営業のマネージャー（既存の運用の決めに乗る）
 */
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { resolveProvider, type IntakeAiProvider } from '../../tasks/services/intake-ai.service';
import { recordAiUsage } from '../../../shared/services/ai-usage.service';
import { normalizeActivityStruct, type ActivityStruct } from '../../../shared/services/activity-struct';
import { modelFor, tierFor } from '../../../shared/services/ai-model';

/** プロンプトを変えたら必ず上げる。`ai_outputs.prompt_version` に入り、改善効果の比較単位になる */
export const ACTIVITY_PROMPT_VERSION = 'activity-v2';
/** 過去の修正傾向を載せた版。**混ぜない** — 載せた効果を後から数字で言えなくなる */
export const ACTIVITY_PROMPT_VERSION_WITH_FEEDBACK = 'activity-v2+fb';


const TIMEOUT_MS = 60_000;

/**
 * 整形に渡す文字数の上限。**超えたら切らずに断る**
 * （黙って切ると、後半に書いた「次にやること」が消えたことに気づけない）。
 */
export const MAX_ACTIVITY_CHARS = 20_000;

/**
 * 発言1つ。**空文字・空配列が「無い」**を表します
 * （省略可にすると、モデルによって欠けたり null になったりして扱いが増える）。
 */
const TurnSchema = z.object({
  side: z.enum(['them', 'us']).describe('them = 取引先の発言 / us = 当社の発言。判断が付かなければ them'),
  name: z.string().describe('発言した人の名前。原文に書かれているものだけ（「露崎様」など）。無ければ空文字'),
  org: z.string().describe('その人の所属。取引先名か「当社」。無ければ空文字'),
  at: z.string().describe('発言の日時。原文に書かれているものだけ（「7/30 21:54」など）。**推測しない**。無ければ空文字'),
  quote: z.string().describe(
    '原文の言葉をそのまま引く。**長くても2文**。言い換え・要約・敬語の直しをしない。'
    + '引ける言葉が無ければ空文字',
  ),
  note: z.string().describe('引用に収まらない補足。**1〜2文**。無ければ空文字'),
  fields: z.array(z.object({
    label: z.string().describe('項目名。**6字以内**（「搬入」「申込」「掲載ロゴ」）'),
    value: z.string().describe('その中身。1〜2文'),
  })).describe('話が複数の項目に分かれているときだけ使う。分かれていなければ空配列'),
});

const ActivitySchema = z.object({
  subject: z.string().describe('件名。**20字以内**。言い切りの短い形（「撮影決定（先方確定）」）。何の話かが一目で分かること'),
  subtitle: z.string().describe('件名の続き。**30字以内**。何を頼まれた／決めたかを並べる（「搬入申請・GMOサイン・掲載ロゴを依頼」）。無ければ空文字'),
  statuses: z.array(z.object({
    label: z.string().describe('状態の名前。**8字以内**（「撮影決定」「昇格の判断待ち」）'),
    tone: z.enum(['decided', 'waiting', 'risk', 'info'])
      .describe('decided = 決まった / waiting = 相手か社内の返事を待っている / risk = 危ない・条件付き / info = そのほか'),
  })).describe('この記録で決まったこと・待っていること。多くて3件。**原文がそう言っているものだけ**。無ければ空配列'),
  facts: z.array(z.object({
    icon: z.enum(['date', 'people', 'gear', 'money', 'place', 'doc'])
      .describe('date = 日付・時間 / people = 人数・体制 / gear = 機材 / money = 金額・見積 / place = 場所 / doc = 書類そのほか'),
    value: z.string().describe('値だけを書く。**項目名を書かない**（「日時: 8/10」ではなく「8/10 5:00–20:00」）。20字程度'),
  })).describe('日時・体制・機材・見積などの事実。多くて4件。**原文に書かれている数字と固有名詞だけ**。無ければ空配列'),
  lead: z.string().describe(
    'この記録全体の要約。**1〜2文**。いちばん大事な条件だけ `**` で囲んで強調してよい。'
    + '**発言の中身を繰り返さない**（続きに発言が並ぶので二度読ませることになる）',
  ),
  turns: z.array(TurnSchema).describe(
    'やり取りを時間の順に並べる。多くて6件。**やり取りが1回しか無ければ1件**。'
    + '相手と当社の発言が読み取れないときは空配列（lead だけで足りる）',
  ),
  next_action: z.string().describe('次にやること。原文に書かれているものだけ。無ければ空文字。**推測しない**'),
  next_action_date: z.string().describe('その期限。"YYYY-MM-DD"。はっきり書かれていなければ空文字。**推測しない**'),
});

const SYSTEM_PROMPT = `あなたは制作会社の営業事務です。
担当者が書いた／メールから取り込んだ「やり取りの記録」を、あとから読める形に整えます。

**HTML は書きません。** 意味の単位（状態・事実・発言）に分けるところまでがあなたの仕事で、
見た目（書体・色・余白・アイコン）は画面が決めます。

## 絶対に守ること

1. **書かれていないことを書かない。** 補う・整合させる・言い換えて意味を強めることは
   すべて誤りです。読み取れないものは空にしてください。
   これは社内の記録ですが、**あとで取引先との話の根拠に使われます**。

2. **言葉を勝手に置き換えない。** 「見積」を「お見積書」に、「NG」を「不可」に直すような
   書き換えはしないでください。**引用（quote）は原文の文字のまま**にします。

3. **次にやることは、原文にあるものだけ。** 「〜しないと」「〜する」と書かれているものを拾います。
   書かれていなければ空文字にしてください。**気を利かせて作らないこと。**

4. **日付を推測しない。** 「来週」「そのうち」「なるべく早く」は空文字です。
   「11月14日」のようにはっきり書かれているものだけ YYYY-MM-DD にします。
   年が書かれていないときは、渡された「やり取りの日」から**最も近い将来の日付**にしてください。

5. **評価を書かない。** 「良い打合せでした」「前向きです」のような感想は入れないこと。
   ただし**取引先が言った評価は引用として残します**（「感動しました」と言われたのは事実）。

## 短く書くこと（いちばんよく失敗するところ）

読む人は1件を数秒で読みます。**同じことを2か所に書かないでください。**

- \`lead\` は全体の1〜2文。**発言の中身を繰り返さない**
- \`quote\` は長くても2文。段落まるごと引かない
- \`facts\` は値だけ（「8/10 5:00–20:00」）。**「日時：」のような項目名を書かない**
- \`statuses\` は名前だけ（「撮影決定」）。文にしない

## 誰の発言かを分ける

取り込んだメールは、先方の依頼と当社の回答が交互に並びます。
**\`turns\` で分けてください** — 1本の文章にまとめると、どちらが言ったことなのかが
文の中にしか残らず、読む人が毎回頭で分解することになります。

- 先方が言ったこと → \`side: "them"\`、\`org\` は取引先名
- 当社が答えたこと → \`side: "us"\`、\`org\` は「当社」
- **どちらか分からないものは \`them\`** にしてください
- 当社の回答が「搬入は〜」「申込は〜」と項目に分かれているときは \`fields\` を使う

やり取りが1回しか無い記録（社内メモ・短い電話）では \`turns\` を1件、
または空配列にして \`lead\` だけで済ませてください。**無理に膨らませないこと。**`;

export interface StructuredActivity {
  subject: string;
  /** 本文の構造（migration 188）。**組み立てられなければ null**＝整形の失敗 */
  struct: ActivityStruct | null;
  nextAction: string | null;
  nextActionDate: string | null;
}

export interface ActivityFormatResult extends StructuredActivity {
  provider: IntakeAiProvider;
  model: string;
  promptVersion: string;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function isActivityAiConfigured(): boolean {
  return resolveProvider() !== null;
}

/**
 * この整形に使うモデル。**段は入力の長さで決まる**（`shared/services/ai-model.ts`）。
 *
 * やり取りの整形は**形を整えるだけ**で、崩れていれば画面を見た人がその場で
 * 気づけるので **light が既定**です。長い記録だけ heavy に上げます。
 *
 * ⚠️ 着手前は `ACTIVITY_AI_MODEL || MINUTES_AI_MODEL || 既定` の順でした。
 * **`MINUTES_AI_MODEL` を1つ入れるとやり取りまで巻き添えで変わる**という、
 * 名前から読み取れない結びつきだったので外してあります。
 */
export function activityModel(provider?: IntakeAiProvider | null, chars = 0): string {
  const p = provider ?? resolveProvider();
  if (!p) return 'none';
  return modelFor('activity', tierFor('activity', { chars }), p);
}

/**
 * LLM の出力を検査する。**そのまま信じない**。
 *
 * - 構造は `normalizeActivityStruct` を通す（知らない値は既定に倒し、長さを切る）
 * - 壊れた日付は空にする（壊れた値で予定を作らない）
 * - 件名が空なら**原文の1行目**で埋める（空の件名は一覧で「無題」に見える）
 *
 * ネットワークに触らないので、素で試せます。
 */
export function normalizeActivity(raw: unknown, original: string): StructuredActivity {
  const r = (raw ?? {}) as Record<string, unknown>;
  const firstLine = original.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const subject = str(r.subject).slice(0, 120) || firstLine.slice(0, 60) || 'やり取りの記録';
  const date = str(r.next_action_date);
  const nextAction = str(r.next_action);
  return {
    subject,
    // 構造は**まるごと**渡す（`subtitle` / `statuses` / `facts` / `lead` / `turns`）。
    // 中身が薄ければ `null` が返り、呼ぶ側が失敗として扱う
    struct: normalizeActivityStruct(r),
    nextAction: nextAction || null,
    // **次にやることが無いのに期限だけ残さない。** 期限だけの行は画面のどこにも出ない
    nextActionDate: nextAction && YMD.test(date) ? date : null,
  };
}

export async function formatActivity(
  text: string,
  opts: { activityDate?: string | null; kindLabel?: string | null; advice?: string[] } = {},
): Promise<ActivityFormatResult> {
  const provider = resolveProvider();
  if (!provider) throw new Error('OPENAI_API_KEY / ANTHROPIC_API_KEY のどちらも未設定です');
  if (text.length > MAX_ACTIVITY_CHARS) {
    throw new Error(`長すぎます（${text.length} 文字）。分けて記録してください`);
  }

  // **長さで段が決まる。** 短い記録は軽いモデルで足りる（`shared/services/ai-model.ts`）
  const model = activityModel(provider, text.length);
  // 過去に人がどう直したかを渡す。**ここがループを閉じている部分**
  const lessons = (opts.advice ?? []).slice(0, 8);
  const lessonBlock = lessons.length
    ? `\n## 前回までの傾向（人があなたの整形をどう直したか）
実測値です。同じ間違いを繰り返さないでください。
ただし**原文に無いことを補ってはいけません**。傾向は形の整え方にだけ使うこと。
${lessons.map((l) => `- ${l}`).join('\n')}\n`
    : '';

  /*
   * **並び順に意味がある。** 入力の「先頭から共通している部分」だけが安く再利用されるので、
   * 毎回変わるもの（日付・本文）を後ろに置きます
   * （投入口の `buildUserPrompt` で測って決めた並べ方と同じ）。
   */
  const userPrompt = `${lessonBlock}やり取りの種類: ${opts.kindLabel || '（指定なし）'}
やり取りの日: ${opts.activityDate || '（不明）'}

## 担当者が書いたもの
"""
${text}
"""`;

  const call = (m: string) => (provider === 'openai'
    ? callOpenAi(m, userPrompt)
    : callAnthropic(m, userPrompt));

  /*
   * **軽いモデルで落ちたら、上位モデルで1回だけやり直す**（投入口と同じ決めごと）。
   *
   * モデル名が使えない環境・構造化出力に対応していない版で**黙って失敗すると**、
   * その行は `format_error` が立って待ち行列から外れ、
   * **「整わない記録がある」としか分からなくなります**。
   *
   * ⚠️ **やり直すのは落ちたときだけ。** 中身が気に入らないときはやり直しません —
   * 「もっともらしいが違う」は例外にならないので、**人が「整え直す」を押す**のが
   * 正しい直し方です（`activity-format.service` の `redoFormat`）。
   */
  const heavy = modelFor('activity', 'heavy', provider);
  let used = model;
  let out: FormatCall;
  try {
    out = await call(model);
  } catch (e) {
    if (model === heavy) throw e;
    console.warn(`[activity] ${model} で落ちたので ${heavy} でやり直します:`, (e as Error).message);
    used = heavy;
    out = await call(heavy);
  }

  await recordAiUsage({
    kind: 'activity', provider, model: used,
    inputTokens: out.usage.inputTokens,
    cachedInputTokens: out.usage.cachedInputTokens,
    outputTokens: out.usage.outputTokens,
  });

  return {
    ...normalizeActivity(out.raw, text),
    provider,
    model: used,
    promptVersion: lessons.length ? ACTIVITY_PROMPT_VERSION_WITH_FEEDBACK : ACTIVITY_PROMPT_VERSION,
  };
}

interface FormatCall { raw: unknown; usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number } }

/** SDK の返す使用量を1つの形に揃える（プロバイダで名前が違う） */
function readUsage(raw: unknown): FormatCall['usage'] {
  const u = (raw ?? {}) as Record<string, unknown>;
  const det = (u.input_tokens_details ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);
  return {
    inputTokens: num(u.input_tokens),
    cachedInputTokens: num(det.cached_tokens) || num(u.cache_read_input_tokens),
    outputTokens: num(u.output_tokens),
  };
}

async function callOpenAi(model: string, userPrompt: string): Promise<FormatCall> {
  const client = new OpenAI({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const response = await client.responses.parse({
    model,
    instructions: SYSTEM_PROMPT,
    input: userPrompt,
    text: { format: zodTextFormat(ActivitySchema, 'activity_log') },
  });
  if (response.status === 'incomplete') {
    throw new Error(`整形が途中で終わりました: ${response.incomplete_details?.reason ?? '理由不明'}`);
  }
  const parsed = response.output_parsed;
  if (!parsed) throw new Error(`整形の結果を読み取れませんでした (status=${response.status ?? '不明'})`);
  return { raw: parsed, usage: readUsage(response.usage) };
}

async function callAnthropic(model: string, userPrompt: string): Promise<FormatCall> {
  const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const response = await client.messages.parse({
    model,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low', format: zodOutputFormat(ActivitySchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });
  if (response.stop_reason === 'refusal') {
    throw new Error(`整形が拒否されました: ${response.stop_details?.explanation ?? '理由不明'}`);
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new Error('整形の結果を読み取れませんでした');
  return { raw: parsed, usage: readUsage(response.usage) };
}
