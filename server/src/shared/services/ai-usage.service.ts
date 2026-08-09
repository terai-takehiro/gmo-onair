/**
 * AI の使用量を1行ずつ残して、集計して返す（migration 181）
 *
 * ── 「どこにいくら掛かっているか」を見えるようにする ────────────
 *
 * 費用を下げる作業は、**削るところを選べないと始まりません**。
 * 呼び出しを 1 行ずつ残し、**種類ごと・モデルごと**に足して見せます。
 *
 * ── 単価は環境変数で渡す ────────────────────────────────────
 *
 * **公開価格をコードに焼き込みません** — 変わるうえ、焼き込むと
 * 「いつの値段か」が分からないまま金額が独り歩きします。
 * `AI_PRICING_JSON` に入っているときだけ金額を出し、
 * 入っていなければ**トークン数と時間だけ**を出します
 * （それだけでも「どこが重いか」は分かります）。
 *
 *   AI_PRICING_JSON={"gpt-5.4":{"in":1.25,"cached_in":0.125,"out":10},
 *                    "gpt-5.4-mini":{"in":0.25,"cached_in":0.025,"out":2},
 *                    "whisper-1":{"per_min":0.006}}
 *
 *   in / cached_in / out … 100万トークンあたりの USD
 *   per_min             … 1分あたりの USD（文字起こし）
 *
 * ── 記録に失敗しても業務を止めない ──────────────────────────
 *
 * `ai_outputs` と同じ扱いです。使用量が 1 行欠けても仕事は進みます。
 */
import { v4 as uuidv4 } from 'uuid';
import { execute, queryAll } from '../db/connection';

export type AiUsageKind = 'intake' | 'minutes' | 'activity' | 'kpt' | 'stt' | 'stt_preview';

export interface AiUsageInput {
  kind: AiUsageKind;
  provider?: string | null;
  model?: string | null;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
  ok?: boolean;
  errorMessage?: string | null;
  actorId?: string | null;
  aiOutputId?: string | null;
}

const n = (v: unknown): number => {
  const x = Math.round(Number(v ?? 0));
  return Number.isFinite(x) && x > 0 ? x : 0;
};

export async function recordAiUsage(input: AiUsageInput): Promise<void> {
  try {
    await execute(
      `INSERT INTO ai_usage
         (id, kind, provider, model, input_tokens, cached_input_tokens, output_tokens,
          audio_seconds, ok, error_message, actor_id, ai_output_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(), input.kind, input.provider ?? null, input.model ?? null,
        n(input.inputTokens), n(input.cachedInputTokens), n(input.outputTokens),
        n(input.audioSeconds), input.ok !== false,
        input.errorMessage ? String(input.errorMessage).slice(0, 500) : null,
        input.actorId ?? null, input.aiOutputId ?? null,
      ],
    );
  } catch (e) {
    console.warn('[ai-usage] 記録に失敗 (呼び出しは成功しています):', (e as Error).message);
  }
}

// ── 単価 ────────────────────────────────────────────────────

interface Price { in?: number; cached_in?: number; out?: number; per_min?: number }

// **鍵は環境変数の中身そのもの。** `true/false` の旗で持つと、
// 値を変えても読み直されない（試験と、再起動なしで直したときに効かない）
let priceCache: { raw: string; value: Record<string, Price> } | null = null;

export function pricing(): Record<string, Price> {
  const raw = (process.env.AI_PRICING_JSON ?? '').trim();
  if (priceCache?.raw === raw) return priceCache.value;

  let value: Record<string, Price> = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, Price>;
      if (parsed && typeof parsed === 'object') value = parsed;
    } catch (e) {
      // **黙って 0 円にしない。** 書き間違いに気づけないと、
      // 「掛かっていない」と読まれてしまう
      console.warn('[ai-usage] AI_PRICING_JSON を読めませんでした:', (e as Error).message);
    }
  }
  priceCache = { raw, value };
  return value;
}

/** 1 行ぶんの概算費用（USD）。単価が無いモデルは null（0 と区別する） */
export function costOf(row: {
  model: string | null; input_tokens: number; cached_input_tokens: number;
  output_tokens: number; audio_seconds: number;
}): number | null {
  const p = pricing()[String(row.model ?? '')];
  if (!p) return null;
  const perMin = p.per_min ?? 0;
  const fresh = Math.max(0, row.input_tokens - row.cached_input_tokens);
  return (
    (fresh / 1_000_000) * (p.in ?? 0)
    + (row.cached_input_tokens / 1_000_000) * (p.cached_in ?? p.in ?? 0)
    + (row.output_tokens / 1_000_000) * (p.out ?? 0)
    + (row.audio_seconds / 60) * perMin
  );
}

export interface UsageRow {
  kind: string;
  model: string | null;
  calls: number;
  failed: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  audio_seconds: number;
  /** 単価が入っていないモデルは null */
  cost_usd: number | null;
}

/**
 * 直近 N 日の使用量を**種類 × モデル**で足す。
 * **失敗した呼び出しも数える** — 課金されることがあるので、外すと総額が合わない。
 */
export async function usageSummary(days = 30): Promise<{
  days: number;
  has_pricing: boolean;
  rows: UsageRow[];
  total_cost_usd: number | null;
}> {
  const rows = (await queryAll(
    `SELECT kind, model,
            COUNT(*)::int                             AS calls,
            COUNT(*) FILTER (WHERE NOT ok)::int       AS failed,
            COALESCE(SUM(input_tokens), 0)::int        AS input_tokens,
            COALESCE(SUM(cached_input_tokens), 0)::int AS cached_input_tokens,
            COALESCE(SUM(output_tokens), 0)::int       AS output_tokens,
            COALESCE(SUM(audio_seconds), 0)::int       AS audio_seconds
       FROM ai_usage
      WHERE created_at >= NOW() - (? || ' days')::interval
      GROUP BY kind, model
      ORDER BY SUM(input_tokens + output_tokens) DESC, kind`,
    [String(Math.min(Math.max(days, 1), 365))],
  )) as unknown as Omit<UsageRow, 'cost_usd'>[];

  const withCost = rows.map((r) => ({ ...r, cost_usd: costOf({ ...r, model: r.model }) }));
  const known = withCost.filter((r) => r.cost_usd !== null);
  return {
    days,
    has_pricing: Object.keys(pricing()).length > 0,
    rows: withCost,
    // **単価の分かるものだけ足す。** 分からないものを 0 として混ぜると総額が嘘になる
    total_cost_usd: known.length ? known.reduce((s, r) => s + (r.cost_usd ?? 0), 0) : null,
  };
}
