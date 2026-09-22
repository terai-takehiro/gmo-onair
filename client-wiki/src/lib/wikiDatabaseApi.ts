/**
 * データベース（設計 docs/design/v4/wiki.md §4-4・§6-⑩）の URL と react-query
 *
 * `client-wiki/CLAUDE.md`「API の URL は `lib/` に集める」の段C版です。
 *
 * ⚠️ **いま段C の呼び出しは2つのファイルに分かれています。**
 *    `components/database/databaseApi.ts`（表・ボード・カレンダーの側）と、この
 *    ファイル（項目の定義・行ページの情報・データベースの作成の側）を、段C の
 *    担当が同時に書いたためです。**実体は増やしていません** — 定義と行の読み書きは
 *    向こうから**再輸出しているだけ**で、問い合わせの鍵（`wikiDbKeys`）も同じものを
 *    使います（別々に持つと、同じ画面が同じものを2回取りに行きます）。
 *    **段C の検査で、向こうの中身をこのファイルへ移して1本にします。**
 *
 * ここにしか無いもの:
 *   - `setWikiPageKind`  … ふつうのページ ⇄ データベース（`PATCH /wiki/pages/:id` の `kind`）
 *   - `createWikiDatabase` … ページを作り、続けてデータベースにする（口が2つ要る）
 *   - `useRowDatabase`   … 行ページから**親の**項目の定義を引く（§6-⑩「行を押すとその行ページ」）
 *   - `rowsOfDatabaseKey` … その親の行の一覧を、ビューに関わらず落とすための鍵
 */
import type {
  WikiItem,
  WikiPage,
  WikiPageKind,
} from '@gmo-onair/shared/src/wiki/types';
import {
  WIKI_DB_URL,
  useWikiDatabase,
  useWikiRows,
  wikiDbKeys,
  saveWikiRowProps,
  saveWikiDatabase,
  createWikiRow,
  type WikiDatabaseDef,
  type WikiRowsResult,
} from '@/components/database/databaseApi';
import {
  WIKI_OPS_URL,
  createWikiPage,
} from '@/components/page/pageOpsApi';
import api from './api';
import { useWikiTree } from './wikiApi';

/* ── 再輸出（実体は `components/database/databaseApi.ts`。検査でこちらへ移す） ── */

export {
  WIKI_DB_URL,
  wikiDbKeys,
  useWikiDatabase,
  useWikiRows,
  saveWikiDatabase,
  saveWikiRowProps,
  createWikiRow,
};
export type { WikiDatabaseDef, WikiRowsResult };

/**
 * その親の行の一覧を、**ビューに関わらず**落とすための鍵（前方一致）。
 *
 * `wikiDbKeys.rows` はビューの id まで持つので、ビューごとに鍵が分かれています。
 * 行の値を1つ直したら、どのビューで開いていても古い値が出ないように全部落とします。
 * ⚠️ 鍵の文字を書き写さず、**`wikiDbKeys` から作ります**（片方だけ直すと落ちなくなる）。
 */
export function rowsOfDatabaseKey(pageId: string): readonly unknown[] {
  const [scope, name, id] = wikiDbKeys.rows(pageId, null);
  return [scope, name, id];
}

/* ── ページの種類（ふつうのページ ⇄ データベース） ────────────── */

/**
 * ページの種類を変える。**版も更新日時も増えません**（サーバーは専用の口を通す）。
 *
 * `database` にすると、サーバーが最初の「表」を1本作ります
 * （タブが1つも無い画面を出さないため・`wiki-database.service.ts`）。
 */
export async function setWikiPageKind(id: string, kind: WikiPageKind): Promise<WikiPage> {
  const res = await api.patch<{ success: boolean; data: WikiPage }>(
    WIKI_OPS_URL.page(id),
    { kind },
  );
  return res.data.data;
}

/**
 * ページは出来たのに、データベースにできなかったとき。
 *
 * **作られたページを持ち歩きます** — ここで「追加できませんでした」とだけ言うと、
 * ツリーに覚えの無いページが1枚残り、作った人はそれが何だったか分かりません。
 * 呼ぶ側は `page` を使って、出来たページへ案内してください。
 */
export class WikiDatabaseKindError extends Error {
  readonly page: WikiPage;

  constructor(page: WikiPage) {
    super('ページは作りました。データベースにはできなかったので、開いてもう一度お試しください。');
    this.name = 'WikiDatabaseKindError';
    this.page = page;
  }
}

export interface CreateWikiDatabaseInput {
  space_id: string;
  /** スペースの直下に作るときは null */
  parent_id?: string | null;
  /** 入れなければサーバーが「無題のページ」にします */
  title?: string;
}

/**
 * データベースを作る。
 *
 * ⚠️ **口が2つ要ります。** `POST /wiki/pages` は種類を受け取らないので、
 *    ページを作ってから `PATCH /wiki/pages/:id` の `kind` で種類を変えます。
 *    後半だけ失敗したときは `WikiDatabaseKindError` を投げます（ページは出来ています）。
 */
export async function createWikiDatabase(input: CreateWikiDatabaseInput): Promise<WikiPage> {
  const created = await createWikiPage({
    space_id: input.space_id,
    parent_id: input.parent_id ?? null,
    title: input.title,
  });
  try {
    return await setWikiPageKind(created.id, 'database');
  } catch {
    throw new WikiDatabaseKindError(created);
  }
}

/* ── 行ページから親の定義を引く ───────────────────────────── */

export interface RowDatabase {
  /** 親がデータベースのときだけ入る。ふつうの子ページでは null */
  parentId: string | null;
  /** そのデータベースの題（「どこの1行か」を行ページに出す） */
  parentTitle: string;
  items: WikiItem[];
  loading: boolean;
}

/**
 * 行ページ（`kind='database'` のページの子）から、親の項目の定義を引く。
 *
 * ⚠️ **親がデータベースかどうかはツリーから読みます。**
 *    `GET /wiki/databases/:pageId` はデータベースでないページに 400 を返すので、
 *    親の種類を知らずに引くと、ふつうの子ページを開くたびに失敗します。
 *    ツリー（`GET /wiki/spaces/:key/tree`）は**ページの画面が既に取っている**一覧で、
 *    `kind` を持っているので、ここを見れば通信が1本も増えません。
 *
 * ⚠️ 親がツリーに出ない（アーカイブ・他人の下書き）ときは、何も出しません。
 *    無い定義を推測して空の欄を並べるより、出さないほうが誤解がありません。
 */
export function useRowDatabase(page: WikiPage | undefined): RowDatabase {
  const treeQ = useWikiTree(page?.parent_id ? page.space_key : undefined);
  const parent = page?.parent_id
    ? (treeQ.data ?? []).find((n) => n.id === page.parent_id)
    : undefined;
  const parentId = parent?.kind === 'database' ? parent.id : null;
  const defQ = useWikiDatabase(parentId ?? undefined);

  return {
    parentId,
    parentTitle: parent?.title ?? '',
    items: defQ.data?.items ?? [],
    loading: treeQ.isLoading || defQ.isLoading,
  };
}
