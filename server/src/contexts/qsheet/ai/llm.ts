/**
 * 制作資料 v4 の AI 生成（段8）— LLM 呼び出しの共通レイヤー。
 *
 * 04-ai.md §0 は「SDK 呼び出しは抽象化されておらず、各サービスに `callOpenAi` /
 * `callAnthropic` の対を手書きする作法」と書いているが、**この4機能（①②③④）は
 * 同じ形（system + user + zod スキーマ 1本）で呼ぶだけ**なので、ここに1本化する。
 * 既存5サービスの中身（`zodTextFormat` + `client.responses.parse()` /
 * `zodOutputFormat` + `client.messages.parse()`）はそのまま踏襲し、
 * **`.optional()` / `.nullable()` / `.default()` を使わない**スキーマ前提（schemas.ts）。
 *
 * 守ること（04-ai.md §8-1）:
 * - **`maxRetries: 0`**（人が待つ経路。1 だと上限時間が実質倍になる）
 * - **light → heavy の1回だけリトライは例外時のみ**（③④のみ・呼び出し側が指定）。
 *   内容が気に入らないときはやり直さない（人が「作り直す」を押す）
 */
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { modelFor, type AiJob, type AiTier } from '../../../shared/services/ai-model';
import { resolveProvider } from '../../tasks/services/intake-ai.service';

export { resolveProvider };
export type LlmProvider = 'openai' | 'anthropic';

export interface LlmUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export interface LlmCallResult<T> {
  raw: T;
  usage: LlmUsage;
  model: string;
  provider: LlmProvider;
}

/** 人が待つ経路のタイムアウト（既存5サービスと同じ 30〜45 秒帯。生成は材料が多いぶん少し長め） */
const TIMEOUT_MS = 45_000;

function readUsage(raw: unknown): LlmUsage {
  const u = (raw ?? {}) as Record<string, unknown>;
  const det = (u.input_tokens_details ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);
  return {
    inputTokens: num(u.input_tokens),
    cachedInputTokens: num(det.cached_tokens) || num(u.cache_read_input_tokens),
    outputTokens: num(u.output_tokens),
  };
}

async function callOpenAiStructured<T>(
  model: string, system: string, user: string, schema: z.ZodType<T>, schemaName: string,
): Promise<{ raw: T; usage: LlmUsage }> {
  const client = new OpenAI({ timeout: TIMEOUT_MS, maxRetries: 0 });
  const response = await client.responses.parse({
    model,
    instructions: system,
    input: user,
    text: { format: zodTextFormat(schema, schemaName) },
  });
  if (response.status === 'incomplete') throw new Error('AI の応答が途中で切れました');
  return { raw: response.output_parsed as T, usage: readUsage(response.usage) };
}

async function callAnthropicStructured<T>(
  model: string, system: string, user: string, schema: z.ZodType<T>,
): Promise<{ raw: T; usage: LlmUsage }> {
  const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 });
  const message = await client.messages.parse({
    model,
    max_tokens: 8192,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { effort: 'medium', format: zodOutputFormat(schema) },
  });
  return { raw: message.parsed_output as T, usage: readUsage(message.usage) };
}

export interface StructuredCallOptions<T> {
  /** `ai-model.ts` の段選び（`ai_usage.kind` とも一致させてある。§7） */
  job: AiJob;
  tier: AiTier;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** OpenAI の `text.format` に渡す名前（英数字のみ） */
  schemaName: string;
  /** 例外時に heavy へ1回だけ上げる。③④のみ true にする（04-ai.md §8-1） */
  retryHeavyOnError?: boolean;
}

/**
 * 構造化出力を1回呼ぶ。プロバイダは `resolveProvider()`（環境変数）が決める。
 * どちらのキーも無ければ即座に例外（呼び出し側が「AI は未設定」の 503 に変換する）。
 */
export async function callStructured<T>(opts: StructuredCallOptions<T>): Promise<LlmCallResult<T>> {
  const provider = resolveProvider();
  if (!provider) throw new Error('OPENAI_API_KEY / ANTHROPIC_API_KEY のどちらも未設定です');

  const model = modelFor(opts.job, opts.tier, provider);
  const call = (m: string) => (provider === 'openai'
    ? callOpenAiStructured(m, opts.system, opts.user, opts.schema, opts.schemaName)
    : callAnthropicStructured(m, opts.system, opts.user, opts.schema));

  try {
    const out = await call(model);
    return { ...out, model, provider };
  } catch (e) {
    if (!opts.retryHeavyOnError) throw e;
    const heavy = modelFor(opts.job, 'heavy', provider);
    if (heavy === model) throw e;
    console.warn(`[qsheet-ai] ${model} で落ちたので ${heavy} でやり直します:`, (e as Error).message);
    const out = await call(heavy);
    return { ...out, model: heavy, provider };
  }
}
