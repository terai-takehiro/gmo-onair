/**
 * Wiki の AI — LLM の呼び出し層（`docs/design/v4/wiki.md` §7-1・§7-5）。
 *
 * ── なぜ Wiki に1本置くか ──────────────────────────────────
 *
 * ① **差し替えられる口が要る。** キーの無い環境（手元・検証の一部）でも
 *    経路全体（記録 → 差分 → 成果 → 還流）を実際に通して確かめたい。
 *    `setWikiAiRunner()` で偽の応答に差し替えられるようにしてあります。
 * ② `qsheet/ai/llm.ts` の `callStructured` は `AiJob`（`shared/services/ai-model.ts`）
 *    を要求しますが、**`wiki_answer` / `wiki_draft` / `wiki_rewrite` はまだ
 *    `AiJob` に入っていません**。段が分かれていて同じ枝を別の担当が書いているため、
 *    このファイルからは `shared/` を書き換えずに済む形にしてあります。
 *
 * ⚠️ **`AiJob` に3つが足された日に、モデル名の解決（`wikiModelFor`）は
 * `modelFor(job, tier, provider)` に置き換えて、この重複を消すこと。**
 * モデル名そのもの（`BUILTIN_MODELS`）は写していません — 写すと世代を上げた日に
 * Wiki だけ古いモデルを呼び続けます。
 *
 * ── 段（§7-1。判断の基準は「間違いに気づけるか」で費用ではない）────
 *
 *   AI に聞く   `wiki_answer`  … **heavy 常に**。手順の誤り（「先に電源を切る」）は
 *                                読んだだけでは気づけず、現場で実行されて初めて分かる
 *   下書き      `wiki_draft`   … **heavy 常に**。長い材料を束ねて書く仕事
 *   整える      `wiki_rewrite` … light（4,000字超で heavy）。いま／整えたあとを
 *                                並べて見せるので、崩れは読めば分かる
 */
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type * as z from 'zod/v4';
import { BUILTIN_MODELS, type AiProvider, type AiTier } from '../../../shared/services/ai-model';
import { recordAiUsage, type AiUsageKind } from '../../../shared/services/ai-usage.service';
import { resolveProvider } from '../../tasks/services/intake-ai.service';
import { AiNotConfiguredError, AiFailedError } from '../../qsheet/services/httpErrors';
import {
  WIKI_ANSWER_KIND, WIKI_DRAFT_KIND, WIKI_REWRITE_KIND, WIKI_REWRITE_HEAVY_CHARS,
} from './wiki-ai.constants';

/** 人が待つ経路。`qsheet/ai/llm.ts` と同じ帯（生成は材料が多いぶん少し長め） */
const TIMEOUT_MS = 45_000;

/** 構造化出力の上限。足りないと途中で切れて**全部**失われる */
const MAX_OUTPUT_TOKENS = 8_192;

export type WikiAiJob = typeof WIKI_ANSWER_KIND | typeof WIKI_DRAFT_KIND | typeof WIKI_REWRITE_KIND;

/**
 * 使用量の `kind`（`ai_usage.kind`）。**3つに分けたまま記録します**（§7-5）。
 *
 * ⚠️ `AiUsageKind` は `shared/services/ai-usage.service.ts` の閉じた union で、
 * Wiki の3つはまだ入っていません（あの表は段が分かれていて別の担当の持ち物です）。
 * 列は `TEXT NOT NULL`（migration 181・CHECK 制約なし）なので**入る値は正しく**、
 * ここで型だけを合わせています。**1つにまとめて既存の kind へ寄せないこと** —
 * 寄せると「1件あたりいくら」が両方とも嘘になります。
 *
 * ⚠️ `AiUsageKind` に3つが足された日に、この写しを消すこと。
 */
const usageKindOf = (job: WikiAiJob): AiUsageKind => job as unknown as AiUsageKind;

export interface WikiAiUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export interface WikiAiCall<T> {
  job: WikiAiJob;
  tier: AiTier;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** OpenAI の `text.format` に渡す名前（英数字と `_` だけ） */
  schemaName: string;
}

export interface WikiAiResult<T> {
  raw: T;
  usage: WikiAiUsage;
  model: string;
  provider: AiProvider;
}

export type WikiAiRunner = <T>(call: WikiAiCall<T>) => Promise<WikiAiResult<T>>;

/* ── 段とモデル ────────────────────────────────────────────── */

/**
 * 仕事と入力の長さから段を決める（§7-1）。
 * **上げることはあっても、下げることはありません**（`tierFor` と同じ作法）。
 */
export function wikiTierFor(job: WikiAiJob, chars = 0): AiTier {
  if (job === WIKI_REWRITE_KIND) return chars > WIKI_REWRITE_HEAVY_CHARS ? 'heavy' : 'light';
  return 'heavy';
}

/** 「軽いモデルを使わない」の印。**モデル名ではない**（`ai-model.ts` と同じ約束） */
const OFF = 'off';

/**
 * 段からモデル名を決める。
 *
 * ⚠️ **`process.env.X` の形で1つずつ読むこと。** `.env` の値がコンテナに
 * 届いているかを見る検査（`scripts/check-env-passthrough.mjs`）は
 * **literal を数えている**ので、動的に引くと `docker-compose.yml` から
 * 消しても止まりません（＝入れたのに効かない状態に気づけない）。
 *
 * Wiki 専用の環境変数は**足しません**（§7 冒頭「新しい呼び出し口は作らない」）。
 * 効くのは段ごとの `AI_MODEL_HEAVY` / `AI_MODEL_LIGHT` だけです。
 */
export function wikiModelFor(tier: AiTier, provider: AiProvider): string {
  const heavy = (process.env.AI_MODEL_HEAVY ?? '').trim() || null;
  const light = (process.env.AI_MODEL_LIGHT ?? '').trim() || null;
  const override = tier === 'heavy' ? heavy : light;
  // `off` は「軽いモデルを使わない」の印。**1回失敗させてから上げない**
  if (override?.toLowerCase() === OFF) return heavy ?? BUILTIN_MODELS.heavy[provider];
  return override ?? BUILTIN_MODELS[tier][provider];
}

/* ── 呼び出し ─────────────────────────────────────────────── */

function readUsage(raw: unknown): WikiAiUsage {
  const u = (raw ?? {}) as Record<string, unknown>;
  const det = (u.input_tokens_details ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);
  return {
    inputTokens: n(u.input_tokens),
    cachedInputTokens: n(det.cached_tokens) || n(u.cache_read_input_tokens),
    outputTokens: n(u.output_tokens),
  };
}

async function callOpenAi<T>(model: string, c: WikiAiCall<T>): Promise<{ raw: T; usage: WikiAiUsage }> {
  const client = new OpenAI({ timeout: TIMEOUT_MS, maxRetries: 0 });
  const response = await client.responses.parse({
    model,
    instructions: c.system,
    input: c.user,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    text: { format: zodTextFormat(c.schema, c.schemaName) },
  });
  if (response.status === 'incomplete') throw new Error('AI の応答が途中で終わりました');
  const parsed = response.output_parsed;
  if (!parsed) throw new Error('AI の応答を読み取れませんでした');
  return { raw: parsed as T, usage: readUsage(response.usage) };
}

async function callAnthropic<T>(model: string, c: WikiAiCall<T>): Promise<{ raw: T; usage: WikiAiUsage }> {
  const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 });
  const message = await client.messages.parse({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: c.system,
    messages: [{ role: 'user', content: c.user }],
    output_config: {
      // 材料が多い仕事は `low` だと冒頭の印象だけで答えが出る（議事録で実測済み）
      effort: c.user.length >= 4_000 ? 'medium' : 'low',
      format: zodOutputFormat(c.schema),
    },
  });
  if (message.stop_reason === 'refusal') throw new Error('AI が応答を断りました');
  const parsed = message.parsed_output;
  if (!parsed) throw new Error('AI の応答を読み取れませんでした');
  return { raw: parsed as T, usage: readUsage(message.usage) };
}

const realRunner: WikiAiRunner = async <T>(c: WikiAiCall<T>): Promise<WikiAiResult<T>> => {
  const provider = resolveProvider();
  if (!provider) throw new AiNotConfiguredError();
  const model = wikiModelFor(c.tier, provider);
  const out = provider === 'openai' ? await callOpenAi(model, c) : await callAnthropic(model, c);
  return { ...out, model, provider };
};

let runner: WikiAiRunner = realRunner;

/**
 * 呼び出し層を差し替える。**試験と、キーの無い環境で経路を通すためだけ**に使います。
 *
 * ⚠️ 返すのは `WikiAiResult` そのもの（構造化出力のあとの形）です。ここを差し替えても
 * **記録・差分・成果・還流は本番と同じ道を通ります** — 通らない道は確かめられません。
 */
export function setWikiAiRunner(fn: WikiAiRunner | null): void {
  runner = fn ?? realRunner;
}

/** いま AI につなげるか（`resolveProvider` か、差し替えた呼び出し層があるか） */
export function isWikiAiReady(): boolean {
  return runner !== realRunner || resolveProvider() !== null;
}

/**
 * 構造化出力を1回呼び、**使用量を記録して**返す。
 *
 * ⚠️ **`kind` は仕事ごとに分けます**（§7-5）。混ぜると「1件あたりいくら」が
 * 両方とも嘘になります。`ai_output_id` は呼んだあとに決まるので、
 * 呼び出し側が `linkUsage` で後から結びます。
 */
export async function callWikiAi<T>(
  c: WikiAiCall<T>,
  actorId: string | null,
): Promise<WikiAiResult<T>> {
  try {
    const out = await runner(c);
    await recordAiUsage({
      kind: usageKindOf(c.job), provider: out.provider, model: out.model,
      inputTokens: out.usage.inputTokens, cachedInputTokens: out.usage.cachedInputTokens,
      outputTokens: out.usage.outputTokens, ok: true, actorId: actorId ?? undefined,
    });
    return out;
  } catch (e) {
    if (e instanceof AiNotConfiguredError) throw e;
    await recordAiUsage({
      kind: usageKindOf(c.job), ok: false, errorMessage: (e as Error).message,
      actorId: actorId ?? undefined,
    });
    throw new AiFailedError(`AI の呼び出しに失敗しました: ${(e as Error).message}`);
  }
}
