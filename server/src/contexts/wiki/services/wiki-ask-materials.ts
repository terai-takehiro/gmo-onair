/**
 * Wiki の AI — 「AI に聞く」の材料集め（`docs/design/v4/wiki.md` §7-1 ①・§7-5）。
 *
 * ⚠️ **AI が読むのは、その人が読めるスペースの公開ページだけです。**
 * 下書き・一覧から隠したページ（`archived`）・`members` のスペースは、
 * 権限の無い人の回答の材料にしません（§8「存在ごと見えない」）。
 * ここを緩めると、**答えの文の中に読めないページの中身が混ざります** —
 * 出典を隠しても文は残るので、あとから気づけません。
 *
 * ⚠️ **本文を材料に渡す量は絞りますが、記録は絞りません。**
 * `ai_outputs.payload_snapshot` に入れるのはページの id と `updated_at` と `rev` だけで、
 * 本文は `wiki_page_versions` からいつでも復元できます（§7-5「全文を二重に持たない」）。
 */
import { queryAll } from '../../../shared/db/connection';
import { readableSpaceIds, type WikiUser } from './wiki-access.service';
import { pathLabels } from './wiki-path.service';
import { searchPages } from './wiki-search.service';
import {
  WIKI_ANSWER_TOP_N, WIKI_ANSWER_CHILD_LIMIT,
  WIKI_MATERIAL_CHARS_PER_PAGE, WIKI_MATERIAL_CHARS_TOTAL,
} from './wiki-ai.constants';

/**
 * 質問から**検索の語**を取り出す（§7-1 ①）。
 *
 * ⚠️ **質問文をそのまま検索にかけてはいけません。** 検索（§5-4）は語ごとに
 * `ILIKE` を **AND** で当てる作りなので、「機材の貸出は」のように助詞が
 * 混ざった1語として渡すと**本文のどこにもその並びが無く、必ず 0 件**になります。
 * 材料が 0 件だと呼ぶ側は「書かれていません」に落とし、**答えられるはずの質問まで
 * 「足りないページ」に積まれます** — 使うほど賢くなる経路の入口が、
 * 嘘の行で埋まることになります（検証用 Postgres で実測: `機材の貸出は` → 0 件 ／
 * `機材` → 6 件）。
 *
 * ⚠️ **形態素解析は入れません**（辞書を抱えると配れなくなる）。日本語は
 * **漢字・カタカナ・英数字のつながり＝内容の語／ひらがなのつながり＝助詞と語尾**、
 * という粗い見立てで切ります。外れても困らないのは、呼ぶ側が**語を減らしながら
 * 何度か試す**うえ、最後は出典が出せなければ答えないためです。
 *
 * ⚠️ **1文字の語は捨てます**（「の」「に」だけでなく「音」も）。1文字は当たりすぎて
 * 上位8ページが関係ない話で埋まり、かえって答えが出なくなります。
 */
export function questionTerms(question: string): string[] {
  const cleaned = String(question ?? '')
    .replace(/[、。．，！？!?・：:；;（）()「」『』【】[\]"'`]/g, ' ')
    .replace(/(ですか|でしょうか|ますか|したい|ください|かな|かね)/gu, ' ');
  const out: string[] = [];
  // 漢字（々〆ヵヶ を含む）／カタカナ（ー を含む）／英数字 のつながりだけ拾う
  for (const m of cleaned.matchAll(/[一-龠々〆ヵヶ]+|[ァ-ヴー]+|[A-Za-z0-9_]+/gu)) {
    const t = m[0];
    if (t.length < 2) continue;
    if (!out.includes(t)) out.push(t);
  }
  // AND なので多すぎると 0 件になる。長い語ほど中身が濃いので前に出す
  return out.sort((a, b) => b.length - a.length).slice(0, 4);
}

export interface WikiMaterial {
  page_id: string;
  title: string;
  space_name: string;
  path: string;
  /** 材料に渡した本文（1ページぶんの上限で切った写し。**保存しない**） */
  body: string;
  /** 本文をすべて渡せたか。渡しきれなかったことを答えのプロンプトにも書く */
  truncated: boolean;
  rev: number;
  updated_at: string;
  /** ページから開いたときの文脈として先に入れたか */
  from_context: boolean;
}

/** `payload_snapshot` に残す形（本文は持たない・§7-5） */
export interface WikiMaterialRef {
  page_id: string;
  title: string;
  rev: number;
  updated_at: string;
  chars: number;
  truncated: boolean;
  from_context: boolean;
}

const MATERIAL_SELECT = `
  SELECT p.id, p.title, p.body_md, p.rev, p.updated_at, p.parent_id,
         s.name AS space_name
    FROM wiki_pages p
    JOIN wiki_spaces s ON s.id = p.space_id
`;

/** **公開ページだけ**・**読めるスペースだけ**（この2つを外さないこと） */
const PUBLISHED_AND_READABLE = `p.deleted_at IS NULL AND p.status = 'published' AND p.space_id = ANY(?)`;

function toMaterial(row: Record<string, unknown>, fromContext: boolean): WikiMaterial {
  const body = String(row.body_md ?? '');
  const truncated = body.length > WIKI_MATERIAL_CHARS_PER_PAGE;
  return {
    page_id: String(row.id),
    title: String(row.title ?? ''),
    space_name: String(row.space_name ?? ''),
    path: '',
    body: truncated ? body.slice(0, WIKI_MATERIAL_CHARS_PER_PAGE) : body,
    truncated,
    rev: Number(row.rev ?? 0),
    updated_at: new Date(row.updated_at as string).toISOString(),
    from_context: fromContext,
  };
}

/**
 * ページから開いたときの文脈（§6-⑤）。**そのページと子ページを先に入れます。**
 *
 * 子は並び順の先頭から数件だけ。全部入れると、子の多いページから聞いたときに
 * 検索で当たった本命が枠から落ちます。
 */
async function contextMaterials(pageId: string, spaceIds: string[]): Promise<WikiMaterial[]> {
  const rows = await queryAll(
    `${MATERIAL_SELECT}
      WHERE ${PUBLISHED_AND_READABLE} AND (p.id = ? OR p.parent_id = ?)
      ORDER BY (p.id = ?) DESC, p.sort_order
      LIMIT ${WIKI_ANSWER_CHILD_LIMIT + 1}`,
    [spaceIds, pageId, pageId, pageId],
  );
  return rows.map((r) => toMaterial(r, true));
}

export interface GatherInput {
  question: string;
  /** ②から開いたときの文脈のページ */
  pageId?: string | null;
  /** スペースを絞って聞く（画面の絞り込み。無ければ読める全部） */
  spaceId?: string | null;
}

/**
 * 質問の材料を集める（§7-1 ①）。
 *
 * ① ページから開いたときは、そのページと子ページを**先に**入れる
 * ② 質問を §5-4 の検索にかけ、上位を埋まるまで足す（合わせて 8 ページ）
 * ③ 合計の文字数の上限で打ち切る（長い1本で枠を使い切らせない）
 *
 * 1件も無ければ空配列。呼ぶ側は**答えずに**「書かれていません」に落とします（§10 #8）。
 */
export async function gatherMaterials(user: WikiUser, input: GatherInput): Promise<WikiMaterial[]> {
  const spaceIds = await readableSpaceIds(user);
  if (spaceIds.length === 0) return [];

  const picked: WikiMaterial[] = [];
  const seen = new Set<string>();

  if (input.pageId) {
    for (const m of await contextMaterials(String(input.pageId), spaceIds)) {
      if (seen.has(m.page_id)) continue;
      seen.add(m.page_id);
      picked.push(m);
    }
  }

  /*
   * ② 検索（読めるスペースの公開ページだけを返す口をそのまま使う・§5-4）。
   *    ⚠️ `searchPages` が返すのは `{ hits, counts }` です（絞り込みの件数つき）。
   *       当たりそのものは `hits` のほうにあります。
   *
   * ⚠️ **語を減らしながら何度か試します。** 検索は語ごとの `ILIKE` を **AND** で
   * 当てるので、質問から取った語を全部渡すと絞られすぎて 0 件になります
   *（「スタジオ 収録 前 準備」の4語すべてを含むページは、たいてい有りません）。
   * **濃い語から順に、当たるまで数を減らす** — 検索の口そのものは段D のままで、
   * ここだけが「質問を検索に変える」責任を持ちます。
   */
  const terms = questionTerms(input.question);
  const attempts: string[][] = [];
  for (let n = terms.length; n >= 1; n -= 1) attempts.push(terms.slice(0, n));
  // 語が1つも取れない質問（ひらがなだけ など）は、質問そのものを最後の頼みにする
  if (attempts.length === 0) attempts.push([String(input.question ?? '').trim()]);

  let hits: { id: string }[] = [];
  for (const attempt of attempts) {
    const q = attempt.join(' ').trim();
    if (!q) continue;
    const found = await searchPages(user, {
      q,
      spaceId: input.spaceId ?? undefined,
      limit: WIKI_ANSWER_TOP_N * 2,
    });
    if (found.hits.length > 0) {
      hits = found.hits;
      break;
    }
  }
  const wanted = hits.map((h) => h.id).filter((id) => !seen.has(id)).slice(0, WIKI_ANSWER_TOP_N);
  if (wanted.length > 0) {
    const rows = await queryAll(
      `${MATERIAL_SELECT} WHERE ${PUBLISHED_AND_READABLE} AND p.id = ANY(?)`,
      [spaceIds, wanted],
    );
    // 検索の順位を保つ（SQL の戻り順は順位ではない）
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    for (const id of wanted) {
      const row = byId.get(id);
      if (!row || seen.has(id)) continue;
      seen.add(id);
      picked.push(toMaterial(row, false));
    }
  }

  // ③ 合計の上限。文脈のページを先に入れてあるので、落ちるのは順位の低いほうから
  const out: WikiMaterial[] = [];
  let total = 0;
  for (const m of picked.slice(0, WIKI_ANSWER_TOP_N + WIKI_ANSWER_CHILD_LIMIT + 1)) {
    if (total + m.body.length > WIKI_MATERIAL_CHARS_TOTAL && out.length > 0) break;
    out.push(m);
    total += m.body.length;
  }

  const paths = await pathLabels(out.map((m) => m.page_id));
  return out.map((m) => ({ ...m, path: paths.get(m.page_id) ?? m.space_name }));
}

/** `ai_outputs.payload_snapshot` に残す形（本文は持たない・§7-5） */
export function materialRefs(materials: WikiMaterial[]): WikiMaterialRef[] {
  return materials.map((m) => ({
    page_id: m.page_id,
    title: m.title,
    rev: m.rev,
    updated_at: m.updated_at,
    chars: m.body.length,
    truncated: m.truncated,
    from_context: m.from_context,
  }));
}

/**
 * プロンプトに載せる材料の塊。**ページの id をそのまま書きます** —
 * AI はこの id で出典を返し、サーバーが材料に入っているかを突き合わせます
 * （入っていない id の出典は落とす・§7-1 ②）。
 */
export function materialBlock(materials: WikiMaterial[]): string {
  return materials
    .map((m, i) => [
      `### 材料${i + 1} page_id=${m.page_id}`,
      `題: ${m.title}`,
      `場所: ${m.path}`,
      `最終更新: ${m.updated_at.slice(0, 10)}`,
      m.truncated ? '（長いので前半だけ渡しています。ここに無いことは「書かれていない」と判断しないでください）' : '',
      '',
      m.body,
    ].filter(Boolean).join('\n'))
    .join('\n\n---\n\n');
}

/* ── 出典の突き合わせ（§7-1 ②）─────────────────────────────── */

/** 画面に出す出典。`quote_verified=false` は「材料に見つからなかった写し」 */
export interface WikiVerifiedCitation {
  page_id: string;
  title: string;
  heading: string | null;
  quote: string;
  /** 引用の文が材料の本文に見つかったか（条件1の印。**消さないこと**） */
  quote_verified: boolean;
}

/** 落とした出典の理由（`payload_snapshot` に残す。作文の検出はここが唯一の入口） */
export interface WikiDroppedCitation {
  page_id: string;
  reason: 'unknown_page';
}

/** 空白・改行・全角空白の違いを無視して突き合わせる（書式の差で落とさないため） */
function flat(s: string): string {
  // 全角空白は **`\u3000` のエスケープで書く**（素の文字だと `no-irregular-whitespace` が
  // 警告になり、着手前の警告数 54 件を1件増やしてしまう）。当たる文字は同じ。
  return s.replace(/[\s\u3000]+/g, '');
}

/** 引用は長すぎても短すぎても役に立たない。画面のチップに収まる長さで切る */
const QUOTE_MAX = 160;
/** これより短い引用は、一致を見ても意味が無い（「はい」はどこにでもある） */
const QUOTE_MIN_VERIFY = 6;

/**
 * AI が返した出典を材料と突き合わせる。
 *
 * ── どこまで厳しくするか（実害で決めた）────────────────────
 *
 * - **材料に無い `page_id` は必ず落とす。** 作られた出典は、押すと 404 になるだけでなく
 *   「根拠がある」という顔をした嘘です。ここは一切ゆるめません
 * - **引用の文が見つからないだけでは落としません。** 全角・改行・記号の差で
 *   正しい回答まで「書かれていません」に落ちると、**答えのある質問が
 *   足りないページに積まれ**、見直しの一覧が嘘で埋まります。
 *   代わりに `quote_verified=false` の印を残し、件数を digest（条件4）で数えて
 *   「引用は写す」をプロンプトに返します
 */
export function verifyCitations(
  raw: Array<{ page_id?: unknown; heading?: unknown; quote?: unknown }>,
  materials: WikiMaterial[],
): { citations: WikiVerifiedCitation[]; dropped: WikiDroppedCitation[] } {
  const byId = new Map(materials.map((m) => [m.page_id, m]));
  const flatBody = new Map(materials.map((m) => [m.page_id, flat(m.body)]));
  const citations: WikiVerifiedCitation[] = [];
  const dropped: WikiDroppedCitation[] = [];
  const seen = new Set<string>();

  for (const c of raw ?? []) {
    const pageId = String(c?.page_id ?? '').trim();
    const material = byId.get(pageId);
    if (!material) {
      if (pageId) dropped.push({ page_id: pageId, reason: 'unknown_page' });
      continue;
    }
    const quote = String(c?.quote ?? '').trim().slice(0, QUOTE_MAX);
    const heading = String(c?.heading ?? '').trim() || null;
    const key = `${pageId}\u0000${heading ?? ''}\u0000${quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const needle = flat(quote);
    citations.push({
      page_id: pageId,
      title: material.title,
      heading,
      quote,
      quote_verified: needle.length >= QUOTE_MIN_VERIFY
        && (flatBody.get(pageId) ?? '').includes(needle),
    });
  }
  return { citations, dropped };
}
