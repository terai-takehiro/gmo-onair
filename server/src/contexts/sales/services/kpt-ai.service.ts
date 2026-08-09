/**
 * ふりかえり（KPT）の下書きを起こす
 *
 * ── なぜ AI に起こさせるか ──────────────────────────────────
 *
 * ふりかえりは**本番が終わった直後にしか書けない**のに、その時期がいちばん忙しく、
 * 結局書かれないまま次の案件に移ります。案件の中には既に材料
 * （やり取り・議事録・遅れたタスク）が揃っているので、**たたき台まで作って**
 * 人は直すだけにします。
 *
 * ── いちばん危ないこと ──────────────────────────────────────
 *
 * **AI が「困ったこと」を作り話で書くこと**です。ふりかえりは人の仕事の評価に
 * 近いところにあり、事実でない「困ったこと」が残ると、次の案件の判断が狂ううえ
 * 名指しされた人が反論できません。だからプロンプトで
 * **材料に書かれていないことは書かない／人を名指ししない**を繰り返し禁じ、
 * 出したものは**確かめられるまで「未確認」**として扱います（`kpt.service`）。
 */
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { resolveProvider, type IntakeAiProvider } from '../../tasks/services/intake-ai.service';
import { recordAiUsage } from '../../../shared/services/ai-usage.service';

export const KPT_PROMPT_VERSION = 'kpt-v1';
export const KPT_PROMPT_VERSION_WITH_FEEDBACK = 'kpt-v1+fb';

const DEFAULT_MODELS: Record<IntakeAiProvider, string> = {
  openai: 'gpt-5.4',
  anthropic: 'claude-opus-5',
};

const TIMEOUT_MS = 90_000;

/** 材料に渡す文字数の上限。**超えたら古いものから落とす**（新しいほど本番に近い） */
const MAX_SOURCE_CHARS = 24_000;

const KptSchema = z.object({
  keep: z.array(z.string()).describe('続けたいこと。うまくいったと材料に書かれていることだけ。多くて4件'),
  problem: z.array(z.string()).describe('困ったこと。材料に書かれている遅れ・手戻り・トラブルだけ。多くて4件。**人を名指ししない**'),
  try: z.array(z.string()).describe('次に試すこと。上の困ったことに対する、材料から素直に出てくる手だけ。多くて4件'),
});

const SYSTEM_PROMPT = `あなたは制作会社の制作進行です。
終わった案件の記録（やり取り・議事録・期限を過ぎたタスク）を読んで、
ふりかえり（KPT）のたたき台を作ります。人がこれを直して確定します。

## 絶対に守ること

1. **材料に書かれていないことを書かない。** 「たぶんこうだったはず」は禁止です。
   材料から言えることが少なければ、**少ないまま**にしてください。
   空の配列で構いません。**埋めるために作らないこと。**

2. **人を名指ししない。** 「○○さんの連絡が遅かった」は書かないでください。
   起きたこと（「先方への確認が期限を1週間過ぎた」）だけを書きます。
   ふりかえりは人を責める場所ではありません。

3. **Problem は事実だけ。** 遅れ・手戻り・トラブルが材料に書かれているものだけです。
   「もっとこうすればよかった」は Problem ではなく Try に書きます。

4. **Try は Problem から素直に出てくるものだけ。** 一般論
   （「コミュニケーションを密にする」）は書かないでください。次の案件で
   **実際にやることが決まる**粒度にします。

5. **1件は40字以内**にします。長い1件より、分けた2件のほうが次に使えます。

6. **評価を書かない。** 「よくできた案件でした」のような総括は要りません。`;

export interface KptDraftResult {
  keep: string[];
  problem: string[];
  try: string[];
  provider: IntakeAiProvider;
  model: string;
  promptVersion: string;
}

export function isKptAiConfigured(): boolean {
  return resolveProvider() !== null;
}

export function kptModel(provider?: IntakeAiProvider | null): string {
  const p = provider ?? resolveProvider();
  if (!p) return 'none';
  return process.env.KPT_AI_MODEL || process.env.MINUTES_AI_MODEL || DEFAULT_MODELS[p];
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** LLM の出力を検査する。**そのまま信じない**。素で試せるように分けてある */
export function normalizeKpt(raw: unknown): { keep: string[]; problem: string[]; try: string[] } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const clean = (v: unknown): string[] => {
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    for (const x of v) {
      const t = str(x).replace(/\s+/g, ' ').slice(0, 200);
      if (!t || out.includes(t)) continue;   // 同じ行を2つ出させない
      out.push(t);
      if (out.length >= 4) break;            // 枠ごと4件まで（多いと人が読まない）
    }
    return out;
  };
  return { keep: clean(r.keep), problem: clean(r.problem), try: clean(r.try) };
}

export interface KptSources {
  projectName: string;
  customerName: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  activities: { activity_date: string; activity_type: string; subject: string; description: string | null }[];
  minutes: Record<string, unknown>[];
  lateTasks: Record<string, unknown>[];
  advice?: string[];
}

/** 材料を字にする。**新しいものから積み、上限で止める**（古いものから落ちる） */
export function buildSourceText(s: KptSources): string {
  const parts: string[] = [];
  const push = (line: string) => {
    if (parts.join('\n').length + line.length > MAX_SOURCE_CHARS) return false;
    parts.push(line);
    return true;
  };

  parts.push('## やり取り');
  for (const a of s.activities) {
    const body = (a.description ?? '').replace(/\s+/g, ' ').slice(0, 400);
    if (!push(`- ${a.activity_date} [${a.activity_type}] ${a.subject}${body ? ` / ${body}` : ''}`)) break;
  }

  parts.push('\n## 議事録');
  for (const m of s.minutes) {
    const decisions = Array.isArray(m.decisions)
      ? (m.decisions as { text?: string }[]).map((d) => d?.text).filter(Boolean).join(' / ') : '';
    const open = Array.isArray(m.open_items)
      ? (m.open_items as { text?: string }[]).map((d) => d?.text).filter(Boolean).join(' / ') : '';
    const line = `- ${str(m.met_on) || '日付不明'} ${str(m.title)}`
      + `${str(m.summary) ? ` / ${str(m.summary).replace(/\s+/g, ' ').slice(0, 400)}` : ''}`
      + `${decisions ? ` / 決定: ${decisions.slice(0, 300)}` : ''}`
      + `${open ? ` / 持ち帰り: ${open.slice(0, 300)}` : ''}`;
    if (!push(line)) break;
  }

  parts.push('\n## 期限を過ぎたタスク');
  for (const t of s.lateTasks) {
    const done = t.is_completed ? '（遅れて完了）' : '（期限を過ぎたまま）';
    if (!push(`- ${str(t.title)} 期限 ${str(t.due_date)} ${done}`)) break;
  }

  return parts.join('\n');
}

export async function draftKpt(sources: KptSources): Promise<KptDraftResult> {
  const provider = resolveProvider();
  if (!provider) throw new Error('OPENAI_API_KEY / ANTHROPIC_API_KEY のどちらも未設定です');
  const model = kptModel(provider);

  const lessons = (sources.advice ?? []).slice(0, 8);
  const lessonBlock = lessons.length
    ? `\n## 前回までの傾向（人があなたの下書きをどう直したか）
実測値です。同じ間違いを繰り返さないでください。
ただし**材料に無いことを補ってはいけません**。傾向は書き方にだけ使うこと。
${lessons.map((l) => `- ${l}`).join('\n')}\n`
    : '';

  // 変わらないもの（傾向）を先に、案件ごとに変わるものを後ろに置く
  const userPrompt = `${lessonBlock}案件: ${sources.projectName}
お客様: ${sources.customerName || '（不明）'}
実施日: ${sources.eventStart || '（未定）'}${sources.eventEnd && sources.eventEnd !== sources.eventStart ? ` 〜 ${sources.eventEnd}` : ''}

${buildSourceText(sources)}`;

  const out = provider === 'openai'
    ? await callOpenAi(model, userPrompt)
    : await callAnthropic(model, userPrompt);

  await recordAiUsage({
    kind: 'kpt', provider, model,
    inputTokens: out.usage.inputTokens,
    cachedInputTokens: out.usage.cachedInputTokens,
    outputTokens: out.usage.outputTokens,
  });

  return {
    ...normalizeKpt(out.raw),
    provider,
    model,
    promptVersion: lessons.length ? KPT_PROMPT_VERSION_WITH_FEEDBACK : KPT_PROMPT_VERSION,
  };
}

interface DraftCall { raw: unknown; usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number } }

function readUsage(raw: unknown): DraftCall['usage'] {
  const u = (raw ?? {}) as Record<string, unknown>;
  const det = (u.input_tokens_details ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);
  return {
    inputTokens: num(u.input_tokens),
    cachedInputTokens: num(det.cached_tokens) || num(u.cache_read_input_tokens),
    outputTokens: num(u.output_tokens),
  };
}

async function callOpenAi(model: string, userPrompt: string): Promise<DraftCall> {
  const client = new OpenAI({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const response = await client.responses.parse({
    model,
    instructions: SYSTEM_PROMPT,
    input: userPrompt,
    text: { format: zodTextFormat(KptSchema, 'kpt_draft') },
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
    output_config: { effort: 'low', format: zodOutputFormat(KptSchema) },
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
