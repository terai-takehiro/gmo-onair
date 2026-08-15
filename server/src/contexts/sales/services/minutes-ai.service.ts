/**
 * 打合せの録音 → 文字起こし (Whisper) → 議事録の下書き (LLM)
 *
 * ご判断 (2026-08): **文字起こしは Whisper**。AI のレビューは月1回・営業のマネージャー。
 *
 * ── 2段に分けている理由 ──────────────────────────────────
 *
 *   ① Whisper が音声 → 文字（そのまま・要約しない）
 *   ② LLM が 文字 → 決定事項・未確認事項
 *
 * ①の結果 (`transcript`) を**そのまま残す**のが要点です。②が変なことを書いたとき、
 * 元の発言に当たれないと直せません。②のプロンプトを直したあと、
 * **同じ文字起こしでやり直せる**ようにもなります。
 *
 * ── 「言っていないことを書かない」を最優先にする ──────────────
 *
 * 議事録は取引先との合意の記録なので、**AI が話を補うのが最悪**です。
 * プロンプトで繰り返し禁じ、決定事項には**根拠の引用**を必ず付けさせます
 * (引用が出せないものは決定事項にしない)。
 *
 * ── 音声は保存しない ────────────────────────────────────
 *
 * 容量と、取引先の声が入るため。文字起こしが済んだら捨てます
 * (`migrations/141_project_minutes.sql` に理由)。
 */
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { resolveProvider, type IntakeAiProvider } from '../../tasks/services/intake-ai.service';
import { recordAiUsage } from '../../../shared/services/ai-usage.service';
import { modelFor, tierFor } from '../../../shared/services/ai-model';

/** プロンプトを変えたら必ず上げる。`ai_outputs.prompt_version` に入り、改善効果の比較単位になる */
export const MINUTES_PROMPT_VERSION = 'minutes-v1';
/** 過去の修正傾向を載せた版。**混ぜない** — 載せた効果を後から数字で言えなくなる */
export const MINUTES_PROMPT_VERSION_WITH_FEEDBACK = 'minutes-v1+fb';

/** 文字起こしのモデル。差し替えたいときのために環境変数で上書きできる */
const WHISPER_MODEL = process.env.MINUTES_STT_MODEL || 'whisper-1';


/**
 * 音声の上限。**Whisper API の上限が 25MB** なので、それを超える前に断る。
 * 32kbps で録れば 25MB ≈ 100 分。画面側でもビットレートを絞っている。
 */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/** 文字起こしは長い録音で数分かかる。**裏で走らせる**ので、リクエストの 60 秒制限とは無関係 */
const STT_TIMEOUT_MS = 10 * 60_000;
const STRUCTURE_TIMEOUT_MS = 120_000;

/** 整形に渡す文字数の上限。超えたら**切らずに断る** (黙って切ると後半の決定事項が消える) */
const MAX_TRANSCRIPT_CHARS = 60_000;

/**
 * Whisper が受け付ける拡張子（OpenAI のドキュメントの一覧）。
 * **拡張子で形式を判断される**ので、中身と食い違うと断られる。
 */
const STT_EXTENSIONS = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'wav', 'webm'];

/** MIME → 拡張子。画面側（`shared/src/client-v4/recording.ts`）と同じ対応表 */
const MIME_TO_EXT: Record<string, string> = {
  'audio/mp4': 'mp4', 'video/mp4': 'mp4',
  'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
  'audio/ogg': 'ogg', 'application/ogg': 'ogg',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
  'audio/webm': 'webm', 'video/webm': 'webm',
};

/**
 * 送られてきた名前が中身と食い違っていたら直す。
 *
 * ── なぜサーバー側にも要るか ────────────────────────────────
 *
 * 画面側でも拡張子を付け直しますが、**古い画面を開いたままの端末**からは
 * 今までどおり `.webm` 決め打ちで飛んできます（`MediaRecorder` の実際の形式が
 * Safari では mp4 なので中身と食い違う）。**受け取る側で直せば、
 * 画面を開き直していない人の録音も通ります。**
 */
export function normalizeAudioName(filename: string, mimeType?: string | null): string {
  const ext = (filename.split('.').pop() ?? '').toLowerCase();
  const fromMime = MIME_TO_EXT[String(mimeType ?? '').split(';')[0].trim().toLowerCase()];
  // 中身から分かるならそちらを正とする（食い違っていたら名前のほうを直す）
  if (fromMime) {
    if (ext === fromMime) return filename;
    const base = filename.replace(/\.[^.]+$/, '');
    return `${base}.${fromMime}`;
  }
  // 中身が分からないときは、せめて受け付けられる拡張子にしておく
  if (STT_EXTENSIONS.includes(ext)) return filename;
  return `${filename.replace(/\.[^.]+$/, '')}.webm`;
}

export function isSttConfigured(): boolean {
  // 空文字（`OPENAI_API_KEY=` と書いてしまった）も「入っていない」扱いにする。
  // そのまま通すと、押せるのに必ず失敗する形になる
  return !!process.env.OPENAI_API_KEY?.trim();
}

/** いま使う文字起こしのモデル名。**設定画面に出す**（秘密ではない） */
export function sttModel(): string {
  return WHISPER_MODEL;
}

/**
 * 議事録の構造化に使うモデル。**常に heavy**（`shared/services/ai-model.ts` の表）。
 *
 * ここは**取引先との合意の記録**です。決定事項には引用を必須にしてあり、
 * 話を補われると**そのまま「言った / 言わない」の材料**になります。
 * 読む人は文字起こしの全文と突き合わせないので、**間違いに気づけません**。
 * 費用がいくら下がっても、ここを軽くする理由にはなりません。
 */
export function structureModel(provider?: IntakeAiProvider | null): string {
  const p = provider ?? resolveProvider();
  if (!p) return 'none';
  return modelFor('minutes', tierFor('minutes'), p);
}

// ── ① 文字起こし ───────────────────────────────────────────

export interface TranscriptResult {
  text: string;
  model: string;
  /** 秒。Whisper が返さないこともあるので null 可 */
  durationSec: number | null;
}

/**
 * Whisper に音声を投げて文字を返す。
 *
 * **要約させない。** 言い淀みも含めてそのまま起こします — 要約は②の仕事で、
 * ここで削ると「言った / 言わない」を確かめられなくなります。
 */
export async function transcribeAudio(
  audio: Buffer,
  filename: string,
  opts: {
    language?: string;
    /**
     * 諦めるまでの時間。**呼ぶ側が待たされている経路では短くすること。**
     *
     * 既定の 10 分は「裏で走らせる」議事録のための値です。
     * **リクエストの中で待つ経路（投入口の録音）でこれを使うと、
     * nginx が 60 秒で切ったあともサーバーだけが 10 分走り続け、
     * 押した人には理由の出ない失敗として見えます。**
     */
    timeoutMs?: number;
    /**
     * SDK に任せるやり直しの回数。**既定は 1**（裏で走る長い文字起こしでは、
     * 一時的な 5xx で録音まるごとを捨てたくない）。
     *
     * ⚠️ **リクエストの中で待つ経路では 0 にすること**（レビューでの指摘 #76）。
     * `maxRetries: 1` は「上限 20 秒」を**上限 40 秒**に変えます — 上の
     * `timeoutMs` は**1回ぶんの上限**で、待つ人が見る時間ではありません。
     * 「短く諦める」と書いてあるのに倍かかるので、書いた本人も気づけません。
     */
    maxRetries?: number;
  } = {},
): Promise<TranscriptResult> {
  if (!isSttConfigured()) {
    throw new Error('OPENAI_API_KEY が未設定です（文字起こしは Whisper を使います）');
  }
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    throw new Error(`音声が大きすぎます（${Math.round(audio.byteLength / 1024 / 1024)}MB / 上限 25MB）。分けて録ってください`);
  }

  const client = new OpenAI({ timeout: opts.timeoutMs ?? STT_TIMEOUT_MS, maxRetries: opts.maxRetries ?? 1 });
  const res = await client.audio.transcriptions.create({
    file: await OpenAI.toFile(audio, filename),
    model: WHISPER_MODEL,
    // 日本語だと明示する。自動判定に任せると、冒頭が英語の挨拶だと英語に倒れることがある
    language: opts.language ?? 'ja',
    response_format: 'verbose_json',
  });

  const text = typeof res.text === 'string' ? res.text.trim() : '';
  if (!text) throw new Error('文字起こしの結果が空でした（音が入っていない可能性があります）');
  const duration = (res as { duration?: unknown }).duration;
  return {
    text,
    model: WHISPER_MODEL,
    durationSec: typeof duration === 'number' ? Math.round(duration) : null,
  };
}

// ── ② 整形 ─────────────────────────────────────────────────

const OpenItemSchema = z.object({
  text: z.string().describe('持ち帰りになったこと。やることが分かる短い文'),
  owner: z.string().describe('だれが持ち帰ったか。文中に出てこなければ空文字。会社名や敬称も含めてよい'),
  due: z.string().describe('いつまでか。"YYYY-MM-DD" 形式。言っていなければ空文字。**推測しない**'),
});

const DecisionSchema = z.object({
  text: z.string().describe('決まったこと。1件1文'),
  quote: z.string().describe('そう判断した根拠を、文字起こしからそのまま引用する。引用できないなら決定事項にしない'),
});

export const MinutesSchema = z.object({
  title: z.string().describe('打合せの表題。30字以内。例「記念式典 配信の内容確認」'),
  summary: z.string().describe('何の打合せで何が話されたかを3〜5行で。**評価や推測を書かない**'),
  decisions: z.array(DecisionSchema).describe('決まったこと。決まっていないことは入れない'),
  open_items: z.array(OpenItemSchema).describe('持ち帰り・未確認になったこと'),
  next_meeting: z.string().describe('次回の日程。"YYYY-MM-DD"。言っていなければ空文字'),
  attendees: z.string().describe('出席者。文字起こしから読み取れる範囲で。読み取れなければ空文字'),
});

const SYSTEM_PROMPT = `あなたは制作会社の議事録係です。
打合せの文字起こしから、議事録の下書きを作ります。

## 絶対に守ること

1. **文字起こしに書かれていないことを書かない。**
   議事録は取引先との合意の記録です。話を補う・整合させる・言い換えて意味を強めることは
   すべて誤りです。読み取れないものは空にしてください。

2. **決定事項には必ず引用を付ける。** 「〜で決まりました」と言い切れる根拠を
   文字起こしからそのまま quote に入れます。**引用が出せないものは決定事項にしない**
   （持ち帰り open_items に回すか、summary に書くだけにする）。

3. **日付を推測しない。** 「来週あたり」「そのうち」「なるべく早く」は空文字にします。
   「11月14日」のようにはっきり言っているものだけ YYYY-MM-DD にしてください。
   年が言われていないときは、渡された「打合せの日」から**最も近い将来の日付**にします。

4. **決まっていないことを決定事項にしない。** 「〜でいいですかね」「〜の方向で」は
   決定ではありません。持ち帰りに入れてください。

5. **言い淀み・雑談・音声の取り違えは落としてよい。** ただし
   **金額・日付・数量・固有名詞は落とさない**（聞き取りが怪しいものは
   そのまま残し、summary に「聞き取りが不確かな箇所があります」と添える）。

6. summary に「良い打合せでした」「前向きです」のような評価を書かない。

何も読み取れない場合は、decisions と open_items を空配列にしてください。無理に作らないこと。`;

export interface StructuredMinutes {
  title: string;
  summary: string;
  decisions: { text: string; quote: string }[];
  open_items: { text: string; owner: string; due: string }[];
  next_meeting: string;
  attendees: string;
}

export interface StructureResult extends StructuredMinutes {
  provider: IntakeAiProvider;
  model: string;
  promptVersion: string;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * LLM の出力を検証する。**そのまま信じない**。
 *
 * - 引用が付いていない決定事項は**持ち帰りに落とす**（消さない。人が判断できるように）
 * - 壊れた日付は空にする（壊れた値で確定させない）
 *
 * ネットワークに触らないので、素で試せます。
 */
export function normalizeMinutes(raw: unknown): StructuredMinutes {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rawDecisions = Array.isArray(r.decisions) ? r.decisions : [];
  const rawOpen = Array.isArray(r.open_items) ? r.open_items : [];

  const decisions: { text: string; quote: string }[] = [];
  const openItems: { text: string; owner: string; due: string }[] = [];

  for (const d of rawDecisions as Record<string, unknown>[]) {
    const text = str(d?.text);
    if (!text) continue;
    const quote = str(d?.quote);
    // 引用が無い = 言い切れる根拠が出せなかった。**決定にせず持ち帰りに回す**
    if (quote) decisions.push({ text, quote });
    else openItems.push({ text, owner: '', due: '' });
  }

  for (const o of rawOpen as Record<string, unknown>[]) {
    const text = str(o?.text);
    if (!text) continue;
    const due = str(o?.due);
    openItems.push({ text, owner: str(o?.owner), due: YMD.test(due) ? due : '' });
  }

  const next = str(r.next_meeting);
  return {
    title: str(r.title).slice(0, 120),
    summary: str(r.summary),
    decisions,
    open_items: openItems,
    next_meeting: YMD.test(next) ? next : '',
    attendees: str(r.attendees),
  };
}

export async function structureMinutes(
  transcript: string,
  opts: { metOn?: string | null; advice?: string[] } = {},
): Promise<StructureResult> {
  const provider = resolveProvider();
  if (!provider) throw new Error('OPENAI_API_KEY / ANTHROPIC_API_KEY のどちらも未設定です');
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    throw new Error(`文字起こしが長すぎます（${transcript.length} 文字）。録音を分けてください`);
  }

  const model = structureModel(provider);
  // 過去に人がどう直したかを渡す。**ここがループを閉じている部分**で、
  // プロンプトを書き換えなくても次から傾向が効く（開発の絶対原則の条件4）
  const lessons = (opts.advice ?? []).slice(0, 8);
  const lessonBlock = lessons.length
    ? `\n## 前回までの傾向（人があなたの下書きをどう直したか）
実測値です。同じ間違いを繰り返さないでください。
ただし**文字起こしに無いことを補ってはいけません**。傾向は判断の重み付けにだけ使うこと。
${lessons.map((l) => `- ${l}`).join('\n')}\n`
    : '';

  const userPrompt = `打合せの日: ${opts.metOn || '（不明）'}
${lessonBlock}
## 文字起こし
"""
${transcript}
"""`;

  const out = provider === 'openai'
    ? await callOpenAi(model, userPrompt)
    : await callAnthropic(model, userPrompt);

  // 費用を見るために残す（`ai_outputs` は「出力」の器なので、ここでは足りない）
  await recordAiUsage({
    kind: 'minutes', provider, model,
    inputTokens: out.usage.inputTokens,
    cachedInputTokens: out.usage.cachedInputTokens,
    outputTokens: out.usage.outputTokens,
  });

  return {
    ...normalizeMinutes(out.raw),
    provider,
    model,
    promptVersion: lessons.length ? MINUTES_PROMPT_VERSION_WITH_FEEDBACK : MINUTES_PROMPT_VERSION,
  };
}

interface StructureCall { raw: unknown; usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number } }

/** SDK の返す使用量を 1 つの形に揃える（プロバイダで名前が違う） */
function readUsage(raw: unknown): StructureCall['usage'] {
  const u = (raw ?? {}) as Record<string, unknown>;
  const det = (u.input_tokens_details ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);
  return {
    inputTokens: num(u.input_tokens),
    cachedInputTokens: num(det.cached_tokens) || num(u.cache_read_input_tokens),
    outputTokens: num(u.output_tokens),
  };
}

async function callOpenAi(model: string, userPrompt: string): Promise<StructureCall> {
  const client = new OpenAI({ timeout: STRUCTURE_TIMEOUT_MS, maxRetries: 1 });
  const response = await client.responses.parse({
    model,
    instructions: SYSTEM_PROMPT,
    input: userPrompt,
    text: { format: zodTextFormat(MinutesSchema, 'meeting_minutes') },
  });
  if (response.status === 'incomplete') {
    throw new Error(`整形が途中で終わりました: ${response.incomplete_details?.reason ?? '理由不明'}`);
  }
  const parsed = response.output_parsed;
  if (!parsed) throw new Error(`整形の結果を読み取れませんでした (status=${response.status ?? '不明'})`);
  return { raw: parsed, usage: readUsage(response.usage) };
}

async function callAnthropic(model: string, userPrompt: string): Promise<StructureCall> {
  const client = new Anthropic({ timeout: STRUCTURE_TIMEOUT_MS, maxRetries: 1 });
  const response = await client.messages.parse({
    model,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low', format: zodOutputFormat(MinutesSchema) },
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
