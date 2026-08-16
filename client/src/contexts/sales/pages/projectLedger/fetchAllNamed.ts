/**
 * 名前で引くための候補を**全部**取ってくる（案件台帳）
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 *
 * ⚠️ **`limit` は書いても 100 までしか効きません。** サーバーの
 * `extractPagination` が `Math.min(100, …)` で丸めるためです
 * （`server/src/shared/services/pagination.ts`）。
 *
 * この画面は名前（「山田 太郎」「A社」）から id を引いて書き換えます。
 * 候補が 100 件で切れていると、**名前順で 101 番目以降の担当・取引先は
 * 「そんな人はいません」と断られます**（レビューでの指摘 #127・#135）。
 * 実在するのに断られるので、貼った人は**名前が間違っている**と思い、
 * 直しようのないものを直しにいきます。しかも
 * **画面のどこにも「候補が切れている」とは出ません**。
 *
 * → **ページを最後までたどって集めます。**
 *
 * ⚠️ **サーバーの丸めは直しません。** `extractPagination` は
 * `GET /projects` を含む**全部の一覧**が読んでいるので、ここを緩めると
 * 関係のない画面が一度に何千件も返すようになります。
 * 直すのは**呼ぶ側**（この関数）です。
 *
 * ── 打ち切りを黙らせない ────────────────────────────────────
 *
 * それでも上限は要ります（何万件あっても取りに行くと画面が固まる）。
 * **打ち切ったことを返します**（`truncated`）— 呼ぶ側が画面に出すためです。
 * 黙って切ると、いま直しているのと同じ壊れ方に戻ります。
 */
import api from '@/lib/api';
import type { NamedRow } from './editable';

/** サーバーが1回に返す上限（`extractPagination` の `Math.min(100, …)`） */
const PER_PAGE = 100;

/**
 * たどるページ数の上限。**100 ページ ＝ 10,000 件**。
 * これを超える取引先を持つようになったら、名前ではなくサーバーで
 * 引き当てる形（`GET /customers?search=`）に変えること。
 */
const MAX_PAGES = 100;

export interface NamedList {
  rows: NamedRow[];
  /** 上限で打ち切ったか。**打ち切ったら画面に出す** */
  truncated: boolean;
}

export async function fetchAllNamed(path: string): Promise<NamedList> {
  const rows: NamedRow[] = [];
  let page = 1;

  for (;;) {
    const body = (await api.get(path, { params: { page, limit: PER_PAGE } })).data;
    const batch = (body?.data ?? []) as NamedRow[];
    rows.push(...batch);

    const totalPages = Number(body?.pagination?.totalPages ?? 1);
    // **空が返ったら止める。** `totalPages` を信じ切ると、数え方が変わった日に
    // 同じページを取り続けます（画面が固まって理由が分からない）
    if (batch.length === 0 || page >= totalPages) return { rows, truncated: false };
    if (page >= MAX_PAGES) return { rows, truncated: true };
    page += 1;
  }
}
