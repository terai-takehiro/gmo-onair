/**
 * Wiki の AI — ③「AI で整える」（`docs/design/v4/wiki.md` §6-③・§7-1）。
 *
 * ── 主な使い方 ────────────────────────────────────────────
 *
 * **手入力のメモを手順書の形（見出し・箇条書き・注意書き）の Markdown に整える**
 * （2026-09-22 のご指示）。記号を覚えていなくてもメモ帳と同じ操作で打てて、
 * あとからこの口で形になる — エディタが手入力を最優先にできるのはこれがあるからです。
 * ほかに 見出しを付ける／箇条書きに／用語を揃える／短くする（`WikiTidyMode`）。
 *
 * ── ここだけの決めごと ────────────────────────────────────
 *
 * ⚠️ **保存しません。** 返すのは「いま／整えたあと」を並べて見せるための結果だけで、
 * 本文を書き換えるのは人が「置き換える」を押したときの保存です。AI が本文を
 * 直接書き換えると、**いま現場が見ている手順が予告なく変わります**。
 *
 * ⚠️ **段は light、ただし 4,000字超は heavy**（§7-1・`wikiTierFor`）。
 * いま／整えたあとを並べて見せるので崩れは読めば分かる、というのが light の根拠です。
 * 長い文は「読めば分かる」が効かなくなる（人は全部を読み比べない）ので上げます。
 *
 * ⚠️ **`ai_outputs` には元の文と結果の全文を残します**（§7-3 条件1）。
 * 本文を保存しないので、**ここに残さないとどこにも残りません**。
 * `target_id` は持ちません（置き換えるかどうかは画面が決めるため）。
 *
 * ⚠️ **新しい LLM の呼び出し口を作りません**（§7 冒頭）。`wiki-ai-llm.ts` の
 * `callWikiAi` を通し、プロンプトは `wiki-ai-prompts.ts`、`kind` と版は
 * `wiki-ai.constants.ts` が正です。
 */
import { queryAll, queryOne } from '../../../shared/db/connection';
import { recordAiOutput } from '../../../shared/services/ai-output.service';
import { NotFoundError, ValidationError } from '../../qsheet/services/httpErrors';
import { assertReadablePage, isWikiEditor, readableSpaceIds, type WikiUser } from './wiki-access.service';
import { classifyByLines, replaceWikiCorrections } from './wiki-ai-corrections.service';
import { wikiAdviceFor } from './wiki-ai-digest.service';
import { callWikiAi, wikiTierFor } from './wiki-ai-llm';
import { WikiRewriteSchema, WIKI_REWRITE_SYSTEM, buildRewritePrompt } from './wiki-ai-prompts';
import {
  WIKI_REWRITE_KIND, WIKI_REWRITE_MAX_CHARS, WIKI_REWRITE_PROMPT_VERSION, withFeedback,
} from './wiki-ai.constants';
import { WIKI_TIDY_MODES, type WikiTidyMode } from './wiki-ai.types';

/** 「社内で使う言葉」に渡すタグの数（プロンプト側も 40 で切っている） */
const GLOSSARY_LIMIT = 40;

/** 置き換えたときの `ai_corrections.field_path`。文そのものへの評価なので1つに固定する */
const REWRITE_FIELD = '(整えた文)';

/** 人が押せるのは2つだけ（画面の「置き換える」「やめる」） */
export const WIKI_REWRITE_DECISIONS = ['replaced', 'cancelled'] as const;
export type WikiRewriteDecision = (typeof WIKI_REWRITE_DECISIONS)[number];

export interface RewriteInput {
  /** 整える元の文（人が打ったまま）。**切り詰めません** */
  text: string;
  /** やり方。既定は structure（手入力のメモ → 手順書の形） */
  mode?: string;
  /** どのページで押したか（任意）。用語を集める範囲をそのスペースに絞る */
  pageId?: string | null;
}

export interface RewriteResult {
  mode: WikiTidyMode;
  /** いま（画面の左） */
  before_md: string;
  /** 整えたあと（画面の右）。**まだ保存されていません** */
  result_md: string;
  /** 揃えた語（「元の語 → 揃えた語」） */
  changed_terms: string[];
  /** 「置き換えた／やめた」を返すときに使う id（`POST /wiki/rewrite/:outputId/decision`） */
  ai_output_id: string | null;
  model: string | null;
  prompt_version: string;
}

/* ── 社内で使う言葉 ──────────────────────────────────────── */

/**
 * この Wiki によく出る語を集める（`buildRewritePrompt` の glossary）。
 *
 * **タグから取ります。** 人が付けた語なので、本文から機械で抜いた語より
 * 「社内でそう呼んでいるもの」に近いからです。
 *
 * ⚠️ **読めるスペースの公開ページだけ**（§7-5）。`members` のスペースのタグは
 * 読めない人のプロンプトに入れません — 語そのものが中身の手掛かりになります。
 */
async function glossaryFor(user: WikiUser, spaceId: string | null): Promise<string[]> {
  const spaceIds = spaceId ? [spaceId] : await readableSpaceIds(user);
  if (spaceIds.length === 0) return [];
  const rows = await queryAll(
    `SELECT t AS term, COUNT(*)::int AS n
       FROM wiki_pages p, LATERAL unnest(p.tags) AS t
      WHERE p.deleted_at IS NULL AND p.status = 'published' AND p.space_id = ANY(?)
      GROUP BY t
      ORDER BY n DESC, t
      LIMIT ${GLOSSARY_LIMIT}`,
    [spaceIds],
  ).catch((e: unknown) => {
    // 語が無くても整えられる。**助けが無いことより、機能が使えないことのほうが損**
    console.warn('[wiki-ai] 社内で使う言葉の読み出しに失敗（整形は続けます）:', (e as Error).message);
    return [];
  });
  return rows.map((r) => String(r.term ?? '')).filter(Boolean);
}

/* ── 整える ───────────────────────────────────────────────── */

function readMode(raw: unknown): WikiTidyMode {
  const mode = String(raw ?? 'structure');
  if (!(WIKI_TIDY_MODES as readonly string[]).includes(mode)) {
    throw new ValidationError('整え方の指定が正しくありません。もう一度お試しください。');
  }
  return mode as WikiTidyMode;
}

/**
 * 「AI で整える」（`POST /wiki/rewrite`）。**保存しません。**
 */
export async function rewriteText(user: WikiUser, input: RewriteInput): Promise<RewriteResult> {
  if (!isWikiEditor(user)) throw new ValidationError('ページを編集する権限がありません。');

  const text = String(input.text ?? '');
  if (!text.trim()) throw new ValidationError('整える文を入れてください。');
  if (text.length > WIKI_REWRITE_MAX_CHARS) {
    // ⚠️ **切り詰めません。** 黙って切ると、後半が整わなかったことに誰も気づけません
    throw new ValidationError(
      `文が長すぎます（${WIKI_REWRITE_MAX_CHARS.toLocaleString()}字まで）。見出しごとに分けてお試しください。`,
    );
  }
  const mode = readMode(input.mode);

  let spaceId: string | null = null;
  if (input.pageId) {
    // **読めないページは「無い」** — 文脈として渡されても存在を確かめさせない（§8）
    await assertReadablePage(user, String(input.pageId));
    const row = await queryOne(
      'SELECT space_id FROM wiki_pages WHERE id = ? AND deleted_at IS NULL',
      [String(input.pageId)],
    );
    spaceId = row ? String(row.space_id) : null;
  }

  const advice = await wikiAdviceFor(WIKI_REWRITE_KIND);
  const promptVersion = advice.length
    ? withFeedback(WIKI_REWRITE_PROMPT_VERSION)
    : WIKI_REWRITE_PROMPT_VERSION;

  const out = await callWikiAi({
    job: WIKI_REWRITE_KIND,
    // **長さで段が上がる唯一の仕事**（`wikiTierFor` の中で 4,000字を見ている）
    tier: wikiTierFor(WIKI_REWRITE_KIND, text.length),
    system: WIKI_REWRITE_SYSTEM,
    user: buildRewritePrompt(mode, text, await glossaryFor(user, spaceId)),
    schema: WikiRewriteSchema,
    schemaName: 'wiki_rewrite',
  }, user.id);

  const resultMd = String(out.raw.result_md ?? '').trim();
  if (!resultMd) {
    // 空を「整えたあと」として並べると、押した人が本文を消してしまいます
    throw new ValidationError('整えた文を作れませんでした。少し短くしてお試しください。');
  }
  const changedTerms = (out.raw.changed_terms ?? []).map(String).filter(Boolean);

  /*
   * 条件1: **元の文と結果を全文で残す**（§7-3）。
   * 本文をどこにも保存しないので、**ここに残さないと元の文は消えます**
   * （下書きは `wiki_page_versions` から復元できますが、整える前のメモは残りません）。
   */
  const outputId = await recordAiOutput({
    kind: WIKI_REWRITE_KIND,
    // `target_id` は持ちません（置き換えるかどうかは画面が決める・`wiki-ai.constants.ts`）
    payload: {
      mode,
      source_md: text,
      result_md: resultMd,
      changed_terms: changedTerms,
      page_id: input.pageId ?? null,
      space_id: spaceId,
      source_chars: text.length,
      advice_used: advice,
    },
    model: out.model,
    promptVersion,
    actorId: user.id,
  });

  return {
    mode,
    before_md: text,
    result_md: resultMd,
    changed_terms: changedTerms,
    ai_output_id: outputId,
    model: out.model,
    prompt_version: promptVersion,
  };
}

/* ── 置き換えた／やめた（条件2）──────────────────────────── */

export interface RewriteDecisionInput {
  decision: string;
  /** 「編集して置き換える」で実際に入れた文（省くと、そのまま置き換えた扱い） */
  finalMd?: string | null;
}

export interface RewriteDecisionResult {
  ai_output_id: string;
  decision: WikiRewriteDecision;
  /** 積んだ差分の種別（`none` / `rephrase` / `fix` / `reject`） */
  correction_type: 'none' | 'rephrase' | 'fix' | 'reject';
}

/**
 * 「置き換えた／やめた」を残す（`POST /wiki/rewrite/:outputId/decision`・§7-3 条件2）。
 *
 * - **置き換えた**（そのまま） … `none`（無修正採用）
 * - **直してから置き換えた** … 行の一致率で自動比較（`rephrase` / `fix`）
 * - **やめた** … `reject`
 *
 * ⚠️ **押し直しは1行に保ちます**（`output_id × field_path` で置き換え）。
 * 「やめる → やっぱり置き換える」が2行積まれると、置き換え率が1より大きくなります。
 *
 * ⚠️ **時間の窓を掛けません。** 下書きの差分（`wiki-ai-corrections.service.ts`）に
 * 7日窓が要るのは、**公開後の普通の更新**が AI の誤りに見えてしまうからです。
 * こちらは人が「置き換える／やめる」を押した**その操作そのもの**で、
 * 普通の業務更新と取り違えようがありません。窓を掛けると、
 * 画面を開いたまま翌週に押した回だけが落ちます。
 *
 * ⚠️ **他の人の出力には書けません。** 整える前のメモは本人しか見ていない文なので、
 * 見つからなかったことにします（403 ではなく 404・§8）。
 */
export async function recordRewriteDecision(
  user: WikiUser,
  outputId: string,
  input: RewriteDecisionInput,
): Promise<RewriteDecisionResult> {
  const decision = String(input.decision ?? '');
  if (!(WIKI_REWRITE_DECISIONS as readonly string[]).includes(decision)) {
    throw new ValidationError('置き換えたか、やめたかを選んでください。');
  }

  const row = await queryOne(
    'SELECT id, payload_snapshot FROM ai_outputs WHERE id = ? AND kind = ? AND actor_id = ?',
    [outputId, WIKI_REWRITE_KIND, user.id],
  );
  if (!row) throw new NotFoundError('見つかりません');

  const payload = (row.payload_snapshot ?? {}) as Record<string, unknown>;
  const resultMd = String(payload.result_md ?? '');
  const finalMd = input.finalMd == null ? null : String(input.finalMd);

  const type: RewriteDecisionResult['correction_type'] = decision === 'cancelled'
    ? 'reject'
    // 直した文が来ていないときは「そのまま置き換えた」= 無修正採用
    : finalMd === null ? 'none' : classifyByLines(resultMd, finalMd);

  await replaceWikiCorrections(
    String(row.id),
    [{
      fieldPath: REWRITE_FIELD,
      before: resultMd,
      after: decision === 'cancelled' ? null : (finalMd ?? resultMd),
      type,
      note: `decision:${decision}`,
    }],
    user.id,
  );

  return { ai_output_id: String(row.id), decision: decision as WikiRewriteDecision, correction_type: type };
}
