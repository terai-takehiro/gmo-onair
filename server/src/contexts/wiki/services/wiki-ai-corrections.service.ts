/**
 * Wiki の AI — **人が直したところを積む**（条件2・`docs/design/v4/wiki.md` §7-3）。
 *
 * ── なぜ保存の口（`wiki-page.service.ts`）から切ったか ───────────
 *
 * あちらは「1枚のページを保存する」業務の口で、こちらは**AI が出したものと
 * 人が直したものを突き合わせて `ai_corrections` に積む**仕事です。役割が違ううえ、
 * 保存の口はすでに長く、片方を直すたびにもう片方を読む状態になります
 * （`sales/services/activity-corrections.service.ts` を切ったのと同じ判断）。
 *
 * ── 何を比べるか ───────────────────────────────────────────
 *
 * before は「**AI が出したもの**」= `ai_outputs.payload_snapshot` の `title` / `body_md`。
 * **保存する直前の行ではありません。** 直前の行と比べると、一度保存してから
 * もう一度直したぶんが全部「無修正」になります（議事録で実測済みの落とし穴）。
 * after はいま保存された本文で、下書きと `wiki_pages.ai_output_id` で結びつきます（§7-3）。
 *
 * ── 7日窓（§7-3「計測を壊しやすい所」）──────────────────────
 *
 * ⚠️ **AI の下書きから7日以内の保存だけ**を数えます。Wiki のページは公開後も
 * 見直し・組織変更で普通に直り続けるので、窓を切らないと**正常な更新が全部
 * 「AI の誤り」**になり、無修正採用率が意味を失います。日数は
 * `WIKI_DRAFT_WINDOW_DAYS`（= 共通の `CORRECTION_WINDOW_DAYS`）で、
 * 窓そのものは共通の `findLatestAiOutput` に任せます — Wiki だけ別の数字を持ちません。
 *
 * ── 積み直しではなく置き換え ───────────────────────────────
 *
 * ⚠️ エディタは**打つのを止めて 1.5 秒で自動保存**します（§6-③）。保存のたびに
 * まるごと積むと、1回の編集で何十行も積まれて**無修正採用率と「よく直される項目」の
 * 両方が壊れます**。`output_id × field_path` で消してから入れ直し、
 * **最後の状態だけ**を1行ずつ残します（`setMessageFeedback` と同じ作法）。
 */
import { execute, queryOne } from '../../../shared/db/connection';
import {
  recordCorrections, findLatestAiOutput, type CorrectionInput,
} from '../../../shared/services/ai-output.service';
import { WIKI_DRAFT_KIND, WIKI_DRAFT_WINDOW_DAYS } from './wiki-ai.constants';

/** 比べる項目（`ai_corrections.field_path`）。**AI が出した2つだけ**を見ます */
const DRAFT_FIELDS = ['title', 'body_md'] as const;

/** 「1文字も直さずに通した」ことの印。無いと無修正採用率の分母が壊れる */
const AS_IS_FIELD = '(全体)';

/** 公開せずに消した下書き。**丸ごと不採用**なので項目を分けない */
const REJECT_FIELD = '(下書き)';

/* ── 行の一致率 ───────────────────────────────────────────── */

/**
 * 比べるときの1行。**前後の空白だけ**を落とし、空行は数えません。
 *
 * 記号（`#`・`-`・`>`）は落としません — Markdown の形を変えたのも
 * 「人が直した」うちです（「AI で整える」がまさにその仕事）。
 */
function linesOf(md: string): string[] {
  return md.split('\n').map((l) => l.trim()).filter(Boolean);
}

/**
 * AI が書いた行のうち、**そのまま残っている割合**（0〜1）。
 *
 * ⚠️ **同じ行が2回出てきたら2回数えません**（一方を使ったら札を減らす）。
 * 数えると、箇条書きの「- なし」が並ぶページで一致率が実態より高く出ます。
 *
 * ネットワークにも DB にも触らない純関数です。
 */
export function wikiLineKeepRatio(before: string, after: string): number {
  const b = linesOf(before);
  if (b.length === 0) return linesOf(after).length === 0 ? 1 : 0;
  const pool = new Map<string, number>();
  for (const line of linesOf(after)) pool.set(line, (pool.get(line) ?? 0) + 1);
  let kept = 0;
  for (const line of b) {
    const left = pool.get(line) ?? 0;
    if (left > 0) {
      kept += 1;
      pool.set(line, left - 1);
    }
  }
  return kept / b.length;
}

/**
 * これ以上そのまま残っていれば「言い回しを直しただけ」とみなす下限。
 *
 * ⚠️ **`rephrase` と `fix` を分ける意味**は、直す先が違うことです。
 * 言い回しばかり直されるならプロンプトの文体の指示を、
 * 半分以上書き換えられるなら**材料の集め方**を疑います。
 * 境目を動かすときは、動かした前後で `by_model` を比べられなくなることに注意
 * （版を上げるのと同じ扱いにすること）。
 */
export const WIKI_REPHRASE_MIN_RATIO = 0.6;

/**
 * 行の一致率で `none` / `rephrase` / `fix` を決める（§7-3 条件2）。
 *
 * ⚠️ **共通の `classifyTextCorrection`（none / enrich / fix）は使いません。**
 * あれは「AI の文が丸ごと残ったまま人が書き足したか」を見る判定で、
 * 手順書のように**並べ替え・言い換えが普通に起きる**文では `fix` に倒れます。
 * Wiki が知りたいのは「どれだけ書き直されたか」なので、行の残り方で測ります。
 */
export function classifyByLines(before: string, after: string): 'none' | 'rephrase' | 'fix' {
  if (before.trim() === after.trim()) return 'none';
  if (!after.trim()) return 'fix';
  return wikiLineKeepRatio(before, after) >= WIKI_REPHRASE_MIN_RATIO ? 'rephrase' : 'fix';
}

/* ── 積む ─────────────────────────────────────────────────── */

/**
 * 同じ出力に**積み直す**（`output_id × field_path` は最後の1行だけ残す）。
 *
 * 差分が1つでも出たら `(全体)` は消します。残すと**同じ出力に「無修正」と
 * 「修正あり」が同居**し、集計がどちらとも読めなくなります。
 * 記録の失敗で保存を止めないのは `recordCorrections` と同じ（best-effort）。
 */
export async function replaceWikiCorrections(
  outputId: string,
  diffs: CorrectionInput[],
  userId: string | null,
  /*
   * ⚠️ **入れ直す行のほかに、消しておきたい項目**。
   * 自動保存は1.5秒ごとに走るので、「直した → 元に戻した」が普通に起きます。
   * 戻したときに入れるのは `(全体) none` の1行だけで、**前に積んだ
   * `title` / `body_md` の行はそのまま残って**いました。同じ出力が
   * 「無修正で採用」と「直された」の両方に数えられ、**digest の無修正率が壊れます**
   *（Codex の指摘・P2）。戻した回は、消す先も渡してもらいます。
   */
  alsoClear: readonly string[] = [],
): Promise<void> {
  if (!diffs.length) return;
  const paths = [...new Set([...diffs.map((d) => d.fieldPath), ...alsoClear])];
  if (diffs.some((d) => d.type !== 'none')) paths.push(AS_IS_FIELD);
  try {
    await execute(
      'DELETE FROM ai_corrections WHERE output_id = ? AND field_path = ANY(?::text[])',
      [outputId, paths],
    );
  } catch (e) {
    // 消せなくても積む。**信号が残らないより、少し重複するほうがまし**
    console.warn('[wiki-ai] 差分の片づけに失敗（記録は続けます）:', (e as Error).message);
  }
  await recordCorrections(outputId, diffs, userId);
}

/* ── ② 下書きを人がどう直したか ──────────────────────────── */

/**
 * AI の下書きと、人が保存した本文の差分を積む（§7-3 条件2）。
 *
 * 呼ぶのは `savePageInternal` の最後（**本文か題を触った保存のときだけ**）。
 * 担当・タグ・見直し予定を直しただけの保存まで数えると、
 * 情報の欄を埋めた人が「AI を直した人」になります。
 *
 * @param saved いま保存された値。`status` は**そのときの状態**で、
 *              `note` に `status:draft` / `status:published` として残します
 *              （「直してから公開した」と「下書きのまま直した」を後から分けるため）。
 */
export async function recordWikiDraftCorrections(
  pageId: string,
  saved: { title: string; body_md: string; status: string },
  userId: string,
): Promise<void> {
  /*
   * 7日窓はここで効きます。`findLatestAiOutput` が返すのは
   * `wiki_pages.ai_output_id` が指しているのと同じ行です（下書きを置いた側が
   * 記録と同時に貼り替えるため）。**共通の口を通すのは窓を1か所に保つため** —
   * 貼り替えに失敗した回（best-effort）でも差分が取れる、という副次の利点もあります。
   */
  const out = await findLatestAiOutput('wiki_pages', pageId, WIKI_DRAFT_KIND, WIKI_DRAFT_WINDOW_DAYS);
  if (!out) return;

  const ai = (out.payload ?? {}) as Record<string, unknown>;
  const before: Record<string, string> = {
    title: String(ai.title ?? ''),
    body_md: String(ai.body_md ?? ''),
  };
  const after: Record<string, string> = {
    title: String(saved.title ?? ''),
    body_md: String(saved.body_md ?? ''),
  };
  // AI が中身を出していない出力に差分を積まない（人が手で書いたページの保存で成績が動く）
  if (!before.title.trim() && !before.body_md.trim()) return;

  const note = `status:${String(saved.status ?? '')}`;
  const diffs: CorrectionInput[] = [];
  for (const field of DRAFT_FIELDS) {
    const type = classifyByLines(before[field], after[field]);
    if (type === 'none') continue;
    diffs.push({ fieldPath: field, before: before[field], after: after[field], type, note });
  }

  if (diffs.length === 0) {
    // **無修正で通した**ことを残す。これが正解ラベルで、無いと分母が壊れる
    // ⚠️ 前の保存で積んだ項目ごとの行も**消してから**入れる（上の `alsoClear` の注記）
    await replaceWikiCorrections(
      out.id, [{ fieldPath: AS_IS_FIELD, type: 'none', note }], userId, DRAFT_FIELDS,
    );
    return;
  }
  // 直さなかった項目も残す（分母）
  for (const field of DRAFT_FIELDS) {
    if (diffs.some((d) => d.fieldPath === field)) continue;
    diffs.push({ fieldPath: field, type: 'none', note });
  }
  await replaceWikiCorrections(out.id, diffs, userId);
}

/**
 * 公開せずに消した AI の下書きを**丸ごと不採用**として1行残す（§7-3 条件2）。
 *
 * 押した人が「これは使えない」と言った唯一の操作なので、いちばん強い信号です。
 *
 * ⚠️ **数えないのは2つ**:
 *   - **公開してから消したもの** … 公開まで進んだのだから下書きは役に立っている。
 *     消したのは業務の整理（古くなった・部署が変わった）で、AI の誤りではありません
 *   - **7日を過ぎたもの** … 同上（このファイル冒頭の窓の話）
 *
 * ⚠️ 状態が `draft` でも、**一度公開してから下書きに戻して消した**回は数えません
 * （`published_at` が残っているので分かります）。状態だけを見ると、
 * 現場で使われたあとの片づけまで AI の成績を下げます。
 */
export async function recordWikiDraftReject(
  pageId: string,
  status: string,
  userId: string,
): Promise<void> {
  if (String(status) !== 'draft') return;

  const out = await findLatestAiOutput('wiki_pages', pageId, WIKI_DRAFT_KIND, WIKI_DRAFT_WINDOW_DAYS);
  if (!out) return;

  const page = await queryOne(
    'SELECT published_at FROM wiki_pages WHERE id = ?', [pageId],
  ).catch((e: unknown) => {
    // 読めないときは**積まない側**に倒す（公開済みを誤って不採用に数えるほうが害が大きい）
    console.warn('[wiki-ai] 下書きの状態を読めませんでした:', (e as Error).message);
    return { published_at: 'unknown' };
  });
  if (page?.published_at) return;

  const ai = (out.payload ?? {}) as Record<string, unknown>;
  const body = String(ai.body_md ?? '');
  const title = String(ai.title ?? '');
  // 中身の無い出力を「不採用」にしても**何も否定していない**（分母だけ増える）
  if (!body.trim() && !title.trim()) return;

  await replaceWikiCorrections(
    out.id,
    [{
      fieldPath: REJECT_FIELD,
      before: { title, body_md: body },
      after: null,
      type: 'reject',
      note: 'deleted_before_publish',
    }],
    userId,
  );
}
