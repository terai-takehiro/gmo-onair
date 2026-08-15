/**
 * 「次にやること」を事実の帯の1行に収める（migration 190）
 *
 * ── 何を解いているか ────────────────────────────────────────
 *
 * `next_action` の言い切り1文は実データで 40〜60 字あり、案件詳細の帯では
 * **文字が切れます**（ご指摘）。規則で切ると必ず途中で切れるので、
 * **AI に「この幅に収まる一文」を作らせます**（ご指示）。
 *
 * ── なぜ整形器（`activity-ai.service`）に混ぜないのか ─────────
 *
 * 整形器が通るのは**画面から書いたときと、まだ整えていない行のバックフィル**だけで、
 * しかも**すでに `next_action` が入っている行のその欄は上書きしません**
 * （取込スキルが決めた値のほうが正しいため）。つまり整形器に足しても
 * **いま長文が入っている行＝ご指摘の行には一生入りません**。
 *
 * ここは入力を **`next_action` そのもの**にしました。出どころ（画面 / メール取込 /
 * MCP）に関係なく効き、**プロンプトを直したあと同じ材料でやり直せます**。
 *
 * ── 短くするだけで、意味を足さない ──────────────────────────
 *
 * - **原文にある言葉で書く。** 言い換えて意味を強めない
 * - **期限は入れない。** 帯は期限を**すぐ下の行に別に出す**ので、
 *   28 字のうち 8 字を「8/14までに」に使うと、肝心の「何をするか」が消える
 * - **`★` と丸数字は入れない。** 印は原文の並びのためのもので、要約には要らない
 * - **ぶら下がる作業は数えない。** 「ほか4件」は画面が件数から作る（AI に数えさせない）
 * - **原文より長い / 空 のものは採らない**（`normalizeShort`）。要約になっていない
 *
 * ⚠️ **`next_action` は書き換えません。** これは**表示用の別の値**です。
 * 上書きにすると、要約を間違えた日に**やることが1件消えたことに誰も気づけません**。
 * 全文はやり取りタブに並びのまま残り、帯でもマウスを乗せれば読めます。
 *
 * ── AI に返る仕組み（会社方針「AI を使い捨てにしない」）────────
 *
 *   条件1 記録   材料（`next_action` 全文）と出力を `ai_outputs`(kind=`next_action_short`) に
 *   条件2 差分   人が短い一文を直したら**サーバーが自動で比べる**（`recordShortCorrections`）。
 *                「これは違う」は `redoShort` が `reject` で残す（時効なし）
 *   条件3 成果   無修正採用率（条件2 から導出）＋ その「次にやること」が
 *                期限内に済んだか（`next_action_done_at`。既存の導出に乗る）
 *   条件4 還流   `getFeedbackDigest('next_action_short')` の advice を次のプロンプトに載せる
 *   条件5 レビュー 月1回・営業のマネージャー（既存の運用の決めに乗る）
 */
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { execute, queryAll, queryOne } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  recordAiOutput, findLatestAiOutput, recordCorrections, type CorrectionInput,
} from '../../../shared/services/ai-output.service';
import { getFeedbackDigest } from '../../../shared/services/ai-feedback.service';
import { recordAiUsage, perRowCost, type CostReason } from '../../../shared/services/ai-usage.service';
import { modelFor } from '../../../shared/services/ai-model';
import { resolveProvider } from '../../tasks/services/intake-ai.service';
import { isActivityAiConfigured } from './activity-ai.service';

/** `ai_outputs.kind`。整形（`activity_format`）と**混ぜない** — 出来の統計が汚れる */
export const NEXT_ACTION_SHORT_KIND = 'next_action_short';

/** プロンプトを変えたら必ず上げる（改善の効果を後から数字で言うため） */
export const SHORT_PROMPT_VERSION = 'na-short-v1';
export const SHORT_PROMPT_VERSION_WITH_FEEDBACK = 'na-short-v1+fb';

/**
 * 収める字数。**帯の1行の実測から決めた**（PC 798px / 12.5px の太字で約 34 字、
 * スマホ 348px で約 26 字）。**狭いほうに合わせる**ので 28 字。
 * ここを上げるとスマホで2行になり、下げると何をするかが消える。
 */
export const SHORT_MAX_CHARS = 28;

/**
 * 短くする対象にする下限。**これ以下は AI を呼びません**（呼んでも同じ文が返るだけで、
 * 課金と待ち行列だけが増える）。上限そのものを閾値にすると、
 * ちょうど収まっている文まで呼ぶことになる。
 */
export const SHORT_MIN_SOURCE_CHARS = SHORT_MAX_CHARS + 1;

const TIMEOUT_MS = 30_000;

/** 短い一文が必要か。**純粋な判定**（`shared/tests/nextActionShort.test.ts` で固定） */
export function needsShort(nextAction: string | null | undefined): boolean {
  const s = String(nextAction ?? '').trim();
  return s.length >= SHORT_MIN_SOURCE_CHARS;
}

/**
 * AI が返した一文を採るかどうか決める。**採れないときは null**（＝失敗として印を立てる）。
 *
 * ここで弾くもの:
 * - 空・改行だけ  … 要約になっていない
 * - 上限を超える  … 収める約束を守れていない（**切り詰めない** — 途中で切れた文を
 *                    「AI が作った要約」として残すと、規則で切るのと同じことになる）
 * - 原文と同じか長い … 短くなっていない
 */
export function normalizeShort(raw: unknown, source: string): string | null {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim().replace(/。$/, '');
  if (!s) return null;
  if ([...s].length > SHORT_MAX_CHARS) return null;
  if ([...s].length >= [...String(source ?? '').trim()].length) return null;
  return s;
}

const ShortSchema = z.object({
  short: z.string().describe(
    `次にやることを ${SHORT_MAX_CHARS} 字以内の一文にしたもの。`
    + '句点は付けない。期限・日付・丸数字・★ は入れない。原文の言葉で書く',
  ),
});

const SYSTEM_PROMPT = `あなたは制作会社の営業事務です。
「次にやること」の長い文を、一覧の狭い枠に収まる**短い一文**にします。

## 守ること

1. **${SHORT_MAX_CHARS} 字以内。** 超えたら使えません（画面で切れます）
2. **原文に書かれていることだけ。** 補う・言い換えて意味を強める・順番を入れ替えて
   別の意味にすることは、すべて誤りです
3. **期限・日付は入れない。** 画面は期限をこの一文のすぐ下に別に出します。
   「8/14までに」を入れると、肝心の「何をするか」が消えます
4. **★ と丸数字（①②）は入れない。** 原文の並びのための印で、要約には要りません
5. **ぶら下がる作業の件数を書かない。** 「ほか4件」は画面が作ります
6. **いちばん大事な1つだけを書く。** 複数あるときは**原文の1文目が言っていること**を採る。
   詰め込むと何をするのか読めません
7. **体言止めでよい。** 「〜する」で終える必要はありません（字数を使うため）

## 例

原文: ★8/14(金)までに 8/28分の備品レンタル発注可否を確定し発注する(発注期日 8/19 は盆明けの中日)。①金子様からの酒樽設置台の可否・金額の回答を確認②パーテーションの追加要否を確定
→ 備品レンタルの発注可否を確定して発注

原文: 見積書(3案)を作成し、部長確認のうえ露崎様へ送付する
→ 見積3案を部長確認のうえ送付`;

export interface ShortResult {
  short: string | null;
  model: string;
  promptVersion: string;
}

/**
 * 1件を短くする。**軽いモデルで足りる仕事**（材料は1文・出力は28字）。
 *
 * ⚠️ **落ちたら上位モデルで1回だけやり直す**（投入口・整形器と同じ決めごと）。
 * モデル名が使えない環境で黙って失敗すると、**「短くならない行がある」としか
 * 分からなくなります**。
 */
export async function shortenNextAction(
  text: string, opts: { advice?: string[] } = {},
): Promise<ShortResult> {
  const provider = resolveProvider();
  if (!provider) throw new Error('OPENAI_API_KEY / ANTHROPIC_API_KEY のどちらも未設定です');

  const lessons = (opts.advice ?? []).slice(0, 6);
  const lessonBlock = lessons.length
    ? `\n## 前回までの傾向（人があなたの一文をどう直したか）\n実測値です。同じ間違いを繰り返さないでください。\n${lessons.map((l) => `- ${l}`).join('\n')}\n`
    : '';
  // **変わらないものを先に、毎回変わるものを後ろに**（入力の再利用が効く並び）
  const userPrompt = `${lessonBlock}## 次にやること（原文）\n"""\n${text}\n"""`;

  const light = modelFor('activity', 'light', provider);
  const heavy = modelFor('activity', 'heavy', provider);
  const call = (m: string) => (provider === 'openai'
    ? callOpenAi(m, userPrompt)
    : callAnthropic(m, userPrompt));

  let used = light;
  let out: { raw: unknown; usage: Usage };
  try {
    out = await call(light);
  } catch (e) {
    if (light === heavy) throw e;
    console.warn(`[na-short] ${light} で落ちたので ${heavy} でやり直します:`, (e as Error).message);
    used = heavy;
    out = await call(heavy);
  }

  await recordAiUsage({
    kind: 'activity_short', provider, model: used,
    inputTokens: out.usage.inputTokens,
    cachedInputTokens: out.usage.cachedInputTokens,
    outputTokens: out.usage.outputTokens,
  });

  const raw = (out.raw ?? {}) as Record<string, unknown>;
  return {
    short: normalizeShort(raw.short, text),
    model: used,
    promptVersion: lessons.length ? SHORT_PROMPT_VERSION_WITH_FEEDBACK : SHORT_PROMPT_VERSION,
  };
}

interface Usage { inputTokens: number; cachedInputTokens: number; outputTokens: number }

function readUsage(raw: unknown): Usage {
  const u = (raw ?? {}) as Record<string, unknown>;
  const det = (u.input_tokens_details ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);
  return {
    inputTokens: num(u.input_tokens),
    cachedInputTokens: num(det.cached_tokens) || num(u.cache_read_input_tokens),
    outputTokens: num(u.output_tokens),
  };
}

async function callOpenAi(model: string, userPrompt: string) {
  const client = new OpenAI({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const response = await client.responses.parse({
    model,
    instructions: SYSTEM_PROMPT,
    input: userPrompt,
    text: { format: zodTextFormat(ShortSchema, 'next_action_short') },
  });
  if (response.status === 'incomplete') throw new Error('AI の応答が途中で切れました');
  return { raw: response.output_parsed as unknown, usage: readUsage(response.usage) };
}

async function callAnthropic(model: string, userPrompt: string) {
  const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const message = await client.messages.parse({
    model,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    output_config: { effort: 'low', format: zodOutputFormat(ShortSchema) },
  });
  return { raw: message.parsed_output as unknown, usage: readUsage(message.usage) };
}

// ────────────────────────────────────────────────────────────
// 待ち行列（行の状態で表す。ジョブの表は作らない）
// ────────────────────────────────────────────────────────────

/**
 * 「まだ短くしていない」の条件。**数えるのと拾ってくるのは必ず同じ式**にする
 * — 別々に書くと「残り 12 件」と言うのに押しても 0 件しか流れない、という
 * 追いにくいずれ方をします（整形器で同じ形の失敗を踏んだ）。
 *
 * **済んだ「次にやること」は対象にしません**（帯に出るのは未完了だけ）。
 * 済ませたあとに戻されたら、その時点で自然に待ち行列へ戻ります。
 */
const PENDING_SQL = `next_action_short IS NULL
        AND next_action_short_error IS NULL
        AND next_action IS NOT NULL
        AND next_action_done_at IS NULL
        AND char_length(btrim(next_action)) >= ${SHORT_MIN_SOURCE_CHARS}`;

export interface ShortQueueStats {
  pending: number;
  failed: number;
  /** 短い一文が入っている件数 */
  done: number;
  /** 短くする必要が無い件数（もともと収まっている）。**合計を合わせるために持つ** */
  fits: number;
  /** 未完了で「次にやること」がある行の総数 */
  total: number;
  /**
   * 金額が出せないときの**理由**。`usdPerRow` が `null` になる状況は**3つ**あり、
   * **打ち手がそれぞれ違います**（`perRowCost` の説明）。
   */
  costReason: CostReason;
  /** 単価が無くて数えられなかったモデル。**どの鍵を足せばよいか**を画面に出す */
  unpricedModels: string[];
  usdPerRow: number | null;
  usdEstimate: number | null;
  configured: boolean;
}

/** 件数と推定費用。**単価が分からなければ金額を出さない**（件数だけ出す） */
export async function shortQueueStats(): Promise<ShortQueueStats> {
  const row = await queryOne(
    `SELECT
       COUNT(*) FILTER (WHERE ${PENDING_SQL}) AS pending,
       COUNT(*) FILTER (WHERE next_action_short IS NULL AND next_action_short_error IS NOT NULL) AS failed,
       COUNT(*) FILTER (WHERE next_action_short IS NOT NULL) AS done,
       COUNT(*) FILTER (WHERE next_action_short IS NULL AND next_action_short_error IS NULL
                          AND char_length(btrim(next_action)) < ${SHORT_MIN_SOURCE_CHARS}) AS fits,
       COUNT(*) AS total
     FROM activity_logs
     WHERE deleted_at IS NULL
       AND next_action IS NOT NULL AND btrim(next_action) <> ''
       AND next_action_done_at IS NULL`,
  ) as Record<string, unknown> | undefined;

  const num = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
  const pending = num(row?.pending);

  const cost = await perRowCost('activity_short');
  const usdPerRow = cost.usdPerRow;

  return {
    pending,
    failed: num(row?.failed),
    done: num(row?.done),
    fits: num(row?.fits),
    total: num(row?.total),
    costReason: cost.reason,
    unpricedModels: cost.unpricedModels,
    usdPerRow,
    usdEstimate: usdPerRow === null ? null : usdPerRow * pending,
    configured: isActivityAiConfigured(),
  };
}

export interface ShortPassResult {
  shortened: number;
  failed: number;
  remaining: number;
  skipped: string | null;
}

/**
 * 待ち行列を上限件数ぶん短くする。**1件の失敗で止めません**
 * （止めると後ろの行がいつまでも短くなりません）。
 */
export async function runShortPass(
  { limit = 40, actorId = null }: { limit?: number; actorId?: string | null } = {},
): Promise<ShortPassResult> {
  const take = Math.max(1, Math.min(200, Math.round(limit)));
  if (!isActivityAiConfigured()) {
    return {
      shortened: 0, failed: 0,
      remaining: (await shortQueueStats()).pending,
      skipped: 'この環境は AI につないでいません',
    };
  }

  const rows = await queryAll(
    `SELECT id, next_action
       FROM activity_logs
      WHERE deleted_at IS NULL AND ${PENDING_SQL}
      ORDER BY activity_date DESC, created_at DESC
      LIMIT ?`,
    [take],
  ) as { id: string; next_action: string }[];

  // 過去に人がどう直したかを載せる（条件4）。**1回だけ引いて使い回す**
  let advice: string[] = [];
  try {
    advice = (await getFeedbackDigest(NEXT_ACTION_SHORT_KIND, 90)).advice ?? [];
  } catch { /* 助言が取れなくても短くはできる */ }

  let shortened = 0;
  let failed = 0;

  for (const row of rows) {
    const source = String(row.next_action ?? '').trim();
    try {
      const r = await shortenNextAction(source, { advice });
      if (!r.short) throw new Error(`${SHORT_MAX_CHARS} 字以内の一文になりませんでした`);

      // **材料と出力の全文を残す**（条件1）。ここが後で「人がどこを直したか」の before
      const aiOutputId = await recordAiOutput({
        kind: NEXT_ACTION_SHORT_KIND,
        targetTable: 'activity_logs',
        targetId: row.id,
        payload: { next_action: source, next_action_short: r.short },
        toolName: 'activity.next_action_short',
        model: r.model,
        promptVersion: r.promptVersion,
        actorId,
      });

      /*
       * **`next_action_short IS NULL` を条件に残す。** 同じ行を2つの回が拾ったとき
       * （画面から流しながら定時実行が起きた等）、後から来たほうを書かせない。
       * **`next_action` が変わっていたら書かない** — 材料が変わった行に
       * 古い材料の要約を貼ると、画面と中身が食い違う
       */
      await execute(
        `UPDATE activity_logs
            SET next_action_short = ?, next_action_short_error = NULL, updated_at = NOW()
          WHERE id = ? AND next_action_short IS NULL AND btrim(next_action) = ?`,
        [r.short, row.id, source],
      );
      void aiOutputId;
      shortened += 1;
    } catch (e) {
      const message = (e as Error).message || '短くできませんでした';
      console.error('[na-short] failed:', row.id, message);
      /*
       * **印を必ず立てる。** 立てないと次の回も同じ行を呼んで課金され、待ち行列も減らない。
       *
       * ⚠️ **ただし、いま失敗した本文にだけ立てる**（レビューでの指摘 #101）。
       * 成功のほうには `btrim(next_action) = ?` が付いているのに、こちらには
       * 付いていませんでした。**引いてから失敗するまでの間に人が「次にやること」を
       * 直していると、失敗の印は新しい本文に付きます** — その本文は一度も試して
       * いないのに、`PENDING_SQL` が印のある行を外すので**二度と短くされません**
       * （画面には長い原文が出たままで、失敗したことも出ません）。
       * 直された行は次の回が拾い直します。
       */
      await execute(
        `UPDATE activity_logs SET next_action_short_error = ?
          WHERE id = ? AND btrim(next_action) = ?`,
        [message.slice(0, 500), row.id, source],
      ).catch(() => { /* 印が書けなくても他の行を続ける */ });
      failed += 1;
    }
  }

  return { shortened, failed, remaining: (await shortQueueStats()).pending, skipped: null };
}

/** 失敗した行をもう一度対象に戻す（プロンプトを直したあと・字数を変えたあと） */
export async function resetShortFailed(): Promise<number> {
  const rows = await queryAll(
    `UPDATE activity_logs SET next_action_short_error = NULL
      WHERE deleted_at IS NULL AND next_action_short IS NULL AND next_action_short_error IS NOT NULL
      RETURNING id`,
  ) as { id: string }[];
  return rows.length;
}

/**
 * 「この一文は違う」— 1件を待ち行列に戻す（条件2 の強い信号）。
 *
 * ⚠️ **7日窓を掛けません。** 窓は「ふつうの業務更新を AI の誤りと数えない」ための
 * もので、**人がボタンを押して「違う」と言ったものは、いつ押されても誤りです**。
 */
export async function redoShort(id: string, actorId: string | null): Promise<void> {
  const row = await queryOne(
    `SELECT id, next_action, next_action_short FROM activity_logs WHERE id = ? AND deleted_at IS NULL`, [id],
  ) as { id: string; next_action: string | null; next_action_short: string | null } | undefined;
  if (!row) throw new AppError(404, 'NOT_FOUND', '活動記録が見つかりません');
  if (!String(row.next_action ?? '').trim()) {
    throw new AppError(400, 'NO_SOURCE', '「次にやること」が入っていないので作り直せません');
  }

  const out = await findLatestAiOutput('activity_logs', id, NEXT_ACTION_SHORT_KIND, 36_500);
  if (out) {
    await recordCorrections(out.id, [{
      fieldPath: 'next_action_short',
      before: row.next_action_short ?? null,
      after: null,
      type: 'reject',
    }], actorId);
  }

  await execute(
    `UPDATE activity_logs
        SET next_action_short = NULL, next_action_short_error = NULL, updated_at = NOW()
      WHERE id = ?`,
    [id],
  );
}

/**
 * 人が短い一文を直したときに差分を残す（条件2）。**人には何も入力させません。**
 *
 * before は**AI が出したもの**（`ai_outputs.payload_snapshot`）です。直前の行の状態と
 * 比べると、**一度直した人がもう一度直したときに「無修正」になります**
 * （議事録で実測して直したのと同じ形の間違い）。
 */
export async function recordShortCorrections(
  id: string, after: string | null, actorId: string | null,
): Promise<void> {
  const out = await findLatestAiOutput('activity_logs', id, NEXT_ACTION_SHORT_KIND);
  if (!out) return;
  const ai = (out.payload ?? {}) as Record<string, unknown>;
  const norm = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
  const before = norm(ai.next_action_short);
  const now = norm(after);

  // **直していないなら積まない。** 開くたびに `none` を積むと、
  // よく開かれる記録ほど精度が高く見える（案件の差分と同じ決めごと）
  if (before === now) return;

  const diffs: CorrectionInput[] = [{
    fieldPath: 'next_action_short',
    before: ai.next_action_short ?? null,
    after: after ?? null,
    /*
     * **空 → 値 は追記ではない。** ここは AI が必ず値を出す欄なので、
     * 人が書き換えたのは**要約の取り違え**（`fix`）。消したのは `reject` で
     * `redoShort` が残すので、ここには来ない
     */
    type: 'fix',
  }];
  await recordCorrections(out.id, diffs, actorId);
}
