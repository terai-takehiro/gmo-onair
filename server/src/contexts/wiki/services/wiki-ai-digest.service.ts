/**
 * Wiki の AI — 貯めたものを AI に戻す（条件4・`docs/design/v4/wiki.md` §7-3・§6-⑦）。
 *
 * ── なぜ「ここで1本作る」か ────────────────────────────────
 *
 * 集計そのものは**既にある** `getFeedbackDigest(kind)`（`shared/services/ai-feedback.service.ts`）
 * がやります。kind を渡せばどの kind でも無修正採用率・よく直される項目・
 * 版ごとの成績を返す作りなので、Wiki のために新しい集計は書きません。
 * ここが足すのは**2つだけ**です:
 *
 *   ① Wiki 固有の成果（`wiki-ai-outcomes.service.ts`。条件3）を横に並べる
 *   ② それを**次のプロンプトに載せる文**（`advice`）にする（条件4の本体）
 *
 * ⚠️ **知識そのものは Wiki のページです**（§7-2）。プロンプトを直すより
 * **足りないページを書くほうが効きます**。だから advice には
 * 「答えられなかった質問が溜まっている」も必ず出します。
 *
 * ⚠️ **`recent_examples` はここから返しません。** 人が直した before / after が
 * そのまま入っており、読めないスペースの本文が混ざりえます（§8）。
 * 見直しの画面（§6-⑦）が要るのは率と傾向で、実例ではありません。
 */
import { getFeedbackDigest, type FieldStat, type ModelStat } from '../../../shared/services/ai-feedback.service';
import { queryOne } from '../../../shared/db/connection';
import {
  WIKI_AI_KINDS, WIKI_ANSWER_KIND, WIKI_DRAFT_KIND, WIKI_REWRITE_KIND, type WikiAiKind,
} from './wiki-ai.constants';
import {
  answerOutcome, draftOutcome, rewriteOutcome,
  type WikiAnswerOutcome, type WikiDraftOutcome, type WikiRewriteOutcome,
} from './wiki-ai-outcomes.service';

/** 件数がこれに満たないうちは、率から断定しない（営業の digest と同じ作法） */
const MIN_SAMPLES = 10;

export interface WikiAiDigest {
  kind: WikiAiKind;
  window_days: number;
  /** レビューを経た出力の数（差分が1行でもある出力） */
  reviewed_outputs: number;
  /** 無修正採用率（0〜1・分母が無ければ null） */
  as_is_rate: number | null;
  /** よく直される項目（鍵を潰した集計） */
  top_corrected_field_types: FieldStat[];
  /** 版・モデルごとの成績。**プロンプトを直した効果はここで見る** */
  by_model: ModelStat[];
  answer?: WikiAnswerOutcome;
  draft?: WikiDraftOutcome;
  rewrite?: WikiRewriteOutcome;
  /** 未着手の「足りないページ」の数と、いちばん多い質問（条件4の本体） */
  gaps?: { open: number; top_question: string | null; top_count: number };
  /** 次のプロンプトに載せる文（この順で並べる） */
  advice: string[];
}

/** 未着手の足りないページ（§7-2）。**プロンプトより先に効く還流** */
async function openGaps(): Promise<{ open: number; top_question: string | null; top_count: number }> {
  const row = await queryOne(
    `SELECT COUNT(*)::int AS open,
            (SELECT question FROM wiki_ai_gaps
              WHERE status = 'open' ORDER BY count DESC, last_asked_at DESC LIMIT 1) AS top_question,
            COALESCE((SELECT MAX(count) FROM wiki_ai_gaps WHERE status = 'open'), 0)::int AS top_count
       FROM wiki_ai_gaps WHERE status = 'open'`,
  );
  return {
    open: Number(row?.open ?? 0),
    top_question: row?.top_question ? String(row.top_question) : null,
    top_count: Number(row?.top_count ?? 0),
  };
}

const pct = (v: number | null): string => (v == null ? '—' : `${Math.round(v * 100)}%`);

/**
 * 次の呼び出しに載せる文を組み立てる。
 *
 * ⚠️ **件数が少ないうちは断定しません。** 3件のうち2件が直されただけで
 * 「見出しの付け方を変えろ」と言うと、**まぐれに合わせて悪くなります**。
 * ⚠️ **「長く書け」と言いません**（`ai-coverage.ts` の学び）。水増しで満たされ、
 * この製品がいちばん避けたい「言っていないことが書かれた記録」になります。
 */
function buildWikiAdvice(d: WikiAiDigest): string[] {
  const out: string[] = [];
  const enough = d.reviewed_outputs >= MIN_SAMPLES;

  if (enough && d.as_is_rate != null && d.as_is_rate < 0.5) {
    out.push(`直近の無修正採用率は ${pct(d.as_is_rate)} です（${d.reviewed_outputs}件）。`
      + '下の「よく直される項目」を先に見てください。');
  }
  for (const f of d.top_corrected_field_types.slice(0, 3)) {
    if (f.corrections < 3) continue;
    const kindOfFix = f.enrich > f.fix
      ? '**書き足されています**（落としている論点があります。拾い直してください）'
      : '**書き換えられています**（取り違えています）';
    out.push(`「${f.field_path}」が ${f.corrections} 件${kindOfFix}。`);
  }

  if (d.answer) {
    const a = d.answer;
    if (a.answers_total >= MIN_SAMPLES) {
      if (a.no_answer_rate != null && a.no_answer_rate >= 0.4) {
        out.push(`答えられなかった割合が ${pct(a.no_answer_rate)} です。`
          + '**材料に無いことを補ってはいけません** — 足りないのは Wiki のページのほうです。');
      }
      if (a.citation_open_rate != null && a.citation_open_rate < 0.3) {
        out.push(`出典が開かれた割合が ${pct(a.citation_open_rate)} と低いです。`
          + '根拠になった一文を、質問に直接答えている箇所から選んでください。');
      }
      if (a.reask_rate != null && a.reask_rate >= 0.3) {
        out.push(`同じ質問が7日以内に ${pct(a.reask_rate)} 再び来ています。`
          + '答えが足りていない可能性があります。手順は省略せず、順番のある作業は番号で書いてください。');
      }
    }
    if (a.unverified_quote_answers > 0) {
      // 件数が少なくても必ず言う（作文は率ではなく1件でも事故）
      out.push(`引用の文が材料に見つからなかった回答が ${a.unverified_quote_answers} 件あります。`
        + '**引用は材料の一文をそのまま写してください**（要約・言い換えをしない）。');
    }
    if (a.feedback.reject >= 3 && a.feedback.reject > a.feedback.good) {
      out.push('「的外れ」が「役に立った」より多く押されています。'
        + '質問の言葉そのものが材料に無いときは、言い換えずに「書かれていません」と返してください。');
    }
  }

  if (d.draft) {
    const dr = d.draft;
    if (dr.drafts_total >= MIN_SAMPLES && dr.published_rate != null && dr.published_rate < 0.5) {
      out.push(`下書きが公開まで進んだ割合は ${pct(dr.published_rate)} です。`
        + '決められないことは本文に書かず、open_questions に出してください。');
    }
    if (dr.reedits_30d_avg != null && dr.reedits_30d_avg >= 3) {
      out.push(`公開後30日に他の人が平均 ${dr.reedits_30d_avg} 回直しています。`
        + '前提と手順の順番を落としていないか確かめてください。');
    }
  }

  if (d.rewrite && d.rewrite.decided >= MIN_SAMPLES
      && d.rewrite.replaced_rate != null && d.rewrite.replaced_rate < 0.6) {
    out.push(`整えた結果が置き換えられた割合は ${pct(d.rewrite.replaced_rate)} です。`
      + '**元の文が既に整っているならそのまま返してください**（無理に書き換えない）。');
  }

  if (d.gaps && d.gaps.open > 0 && d.gaps.top_question) {
    out.push(`答えられなかった質問が ${d.gaps.open} 件たまっています`
      + `（最多は「${d.gaps.top_question}」の ${d.gaps.top_count} 回）。`
      + 'これはページを書けば解ける種類の不足です。');
  }
  return out;
}

/**
 * 1つの kind の digest（§6-⑦ の「AI の直され方」タブと、次のプロンプトの材料）。
 */
export async function getWikiAiDigest(kind: WikiAiKind, windowDays = 90): Promise<WikiAiDigest> {
  const base = await getFeedbackDigest(kind, windowDays);
  const digest: WikiAiDigest = {
    kind,
    window_days: base.window_days,
    reviewed_outputs: base.reviewed_outputs,
    as_is_rate: base.as_is_rate,
    top_corrected_field_types: base.top_corrected_field_types,
    by_model: base.by_model,
    advice: [],
  };
  if (kind === WIKI_ANSWER_KIND) {
    digest.answer = await answerOutcome(windowDays);
    digest.gaps = await openGaps();
  }
  if (kind === WIKI_DRAFT_KIND) {
    digest.draft = await draftOutcome(windowDays);
    digest.gaps = await openGaps();
  }
  if (kind === WIKI_REWRITE_KIND) digest.rewrite = await rewriteOutcome(windowDays);
  digest.advice = buildWikiAdvice(digest);
  return digest;
}

/** 3つまとめて（見直しの画面が1回で読む） */
export async function getWikiAiDigests(windowDays = 90): Promise<WikiAiDigest[]> {
  const out: WikiAiDigest[] = [];
  for (const kind of WIKI_AI_KINDS) out.push(await getWikiAiDigest(kind, windowDays));
  return out;
}

/**
 * 次の呼び出しのプロンプトに載せる文（条件4の還流の本体）。
 *
 * ⚠️ **best-effort**。集計が落ちても AI の呼び出しは止めません —
 * 助言が無いことより、機能が使えないことのほうが損です。
 * 返り値が空なら、呼ぶ側は版に `+fb` を付けません（載せた効果を測る単位が崩れる）。
 */
export async function wikiAdviceFor(kind: WikiAiKind, windowDays = 90): Promise<string[]> {
  try {
    return (await getWikiAiDigest(kind, windowDays)).advice;
  } catch (e) {
    console.warn('[wiki-ai] 直され方の読み出しに失敗（呼び出しは続けます）:', (e as Error).message);
    return [];
  }
}
