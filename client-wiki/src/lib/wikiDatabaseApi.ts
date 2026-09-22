/**
 * データベース（設計 docs/design/v4/wiki.md §4-4・§6-⑩）がサーバーを呼ぶところ
 *
 * `client-wiki/CLAUDE.md`「API の URL は `lib/` に集める」の段C版です。
 * **段C を3人で同時に書いた間だけ2つに分かれていましたが、1本に戻しました**
 * （同じ問い合わせの鍵を2か所に持つと、同じ画面が同じものを2回取りに行きます）。
 *
 * サーバーの正は `server/src/contexts/wiki/routes/databases.routes.ts`:
 *   GET  /wiki/databases/:pageId           項目とビューの定義（reader）
 *   PUT  /wiki/databases/:pageId           項目とビューを**まとめて**保存（editor）
 *   GET  /wiki/databases/:pageId/rows      行の一覧（`?view=` でビューを当てる・reader）
 *   POST /wiki/databases/:pageId/rows      行を1本足す（題だけでよい・editor）
 *   GET  /wiki/databases/:pageId/rows.csv  書き出し（reader）
 *
 * **値の保存とページの種類は段B の口をそのまま使います**（新しい口を作らない）:
 *   PATCH /wiki/pages/:rowId               行の値（`props` を丸ごと送る・editor）
 *   PATCH /wiki/pages/:id                  ふつうのページ ⇄ データベース（`kind`・editor）
 *
 * ⚠️ **絞り込みと並べ替えはサーバーが当てます**（`wiki-view-apply.ts`）。
 *    表・ボード・カレンダー・CSV が同じ答えを見るためで、画面側で当て直しません。
 *
 * 応答はこの製品の作法どおり `{ success: true, data: … }` で包まれています。
 */
import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  WikiDatabase,
  WikiItem,
  WikiPage,
  WikiPageKind,
  WikiPropValue,
  WikiRow,
  WikiView,
} from '@gmo-onair/shared/src/wiki/types';
import { WIKI_OPS_URL, createWikiPage } from '@/components/page/pageOpsApi';
import api from './api';
import { wikiKeys, useWikiTree } from './wikiApi';

export const WIKI_DB_URL = {
  /** 項目とビューの定義（親ページに1件） */
  database: (pageId: string) => `/wiki/databases/${pageId}`,
  /** 行の一覧。`?view=` を付けるとそのビューの絞り込み・並べ替えが当たる */
  rows: (pageId: string) => `/wiki/databases/${pageId}/rows`,
  /** 書き出し（CSV）。`?view=` を付けると表に出ている行・列・並び順のまま */
  rowsCsv: (pageId: string) => `/wiki/databases/${pageId}/rows.csv`,
  /** 行1件の値の保存。段B の保存と同じ口 */
  row: (rowId: string) => `/wiki/pages/${rowId}`,
} as const;

export const wikiDbKeys = {
  database: (pageId: string) => ['wiki', 'database', pageId] as const,
  rows: (pageId: string, viewId: string | null) => ['wiki', 'database-rows', pageId, viewId ?? ''] as const,
};

/** `{ success, data }` の包みを外す */
function unwrap<T>(res: { data: { success?: boolean; data: T } }): T {
  return res.data.data;
}

/* ── 返ってくる形 ─────────────────────────────────────────── */

/** `GET /wiki/databases/:pageId`。`WikiDatabase` にサーバーだけが返すものを足したもの */
export interface WikiDatabaseDef extends WikiDatabase {
  updated_by_name?: string | null;
  /** 直前の保存で定義から消えた項目（画面は「値は残しました」と伝える） */
  removed_item_ids?: string[];
  /** 消した項目の値を行から落としたか */
  dropped_values?: boolean;
}

/** `GET /wiki/databases/:pageId/rows` */
export interface WikiRowsResult {
  page_id: string;
  /** 当てたビュー。指定が無い・見つからないときは null */
  view_id: string | null;
  items: WikiItem[];
  views: WikiView[];
  rows: WikiRow[];
  /** 行が多すぎて切ったか。画面は絞り込みを勧める */
  truncated: boolean;
}

/* ── 読む ─────────────────────────────────────────────────── */

/**
 * 項目とビューの定義。
 *
 * ⚠️ **まだ1度も定義していないデータベースでも 404 にはなりません**（項目もビューも空）。
 *    画面は「まだ項目がありません」を出して追加に誘います。
 */
export function useWikiDatabase(pageId: string | undefined) {
  return useQuery({
    queryKey: wikiDbKeys.database(pageId ?? ''),
    enabled: !!pageId,
    queryFn: async ({ signal }) =>
      unwrap<WikiDatabaseDef>(await api.get(WIKI_DB_URL.database(pageId!), { signal })),
  });
}

/** 行の一覧。**ビューを変えたら取り直す**（絞り込みと並べ替えはサーバーが当てるため） */
export function useWikiRows(pageId: string | undefined, viewId: string | null) {
  return useQuery({
    queryKey: wikiDbKeys.rows(pageId ?? '', viewId),
    enabled: !!pageId,
    queryFn: async ({ signal }) =>
      unwrap<WikiRowsResult>(
        await api.get(WIKI_DB_URL.rows(pageId!), { signal, params: viewId ? { view: viewId } : undefined }),
      ),
  });
}

/* ── 書く ─────────────────────────────────────────────────── */

export interface SaveWikiDatabaseInput {
  /** **まとめて送ります。** 片方だけ送ると、サーバーはもう片方を消さずに止めます */
  items: WikiItem[];
  views: WikiView[];
  /** 定義から消した項目の値を、全ての行から落とすか（既定は残す） */
  dropValues?: boolean;
  /** 画面が最後に受け取った定義の `updated_at`。食い違えば 409 */
  expected_updated_at?: string;
}

export async function saveWikiDatabase(
  pageId: string,
  input: SaveWikiDatabaseInput,
): Promise<WikiDatabaseDef> {
  return unwrap<WikiDatabaseDef>(await api.put(WIKI_DB_URL.database(pageId), input));
}

export interface CreateWikiRowInput {
  title: string;
  props?: Record<string, WikiPropValue>;
}

/**
 * 行を1本足す。**題を打つだけで作れます**（設計 §6-⑩）。
 * 作られるのは子ページなので、ツリーにも出ます。
 */
export async function createWikiRow(pageId: string, input: CreateWikiRowInput): Promise<WikiRow> {
  return unwrap<WikiRow>(await api.post(WIKI_DB_URL.rows(pageId), input));
}

/**
 * 行の値を保存する。**`props` は丸ごと送ります**（サーバーは送られた値で置き換える）。
 * 呼ぶ側が「いまの値 ＋ 直した1つ」を作って渡してください。
 *
 * 本文・題を送らないので、誰かがその行ページを書いている最中でも通ります。
 */
export async function saveWikiRowProps(
  rowId: string,
  props: Record<string, WikiPropValue>,
): Promise<WikiPage> {
  return unwrap<WikiPage>(await api.patch(WIKI_DB_URL.row(rowId), { props }));
}

/**
 * CSV で書き出す（Notion と同じ形・1行目が項目名）。
 *
 * ⚠️ `URL.createObjectURL` で作った URL は**必ず捨てる**（捨てないとタブの寿命だけ残る）。
 */
export async function downloadRowsCsv(
  pageId: string,
  title: string,
  viewId: string | null,
): Promise<void> {
  const res = await api.get<Blob>(WIKI_DB_URL.rowsCsv(pageId), {
    responseType: 'blob',
    params: viewId ? { view: viewId } : undefined,
  });
  const name = `${title.replace(/[\\/:*?"<>|]/g, '').trim() || pageId}.csv`;
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ── 取り直し ─────────────────────────────────────────────── */

/**
 * 書いたあとに読み直すもの。
 *
 * 行を足すとツリーにも出る（行＝子ページ）ので、ツリーも一緒に落とします。
 * スペースの key が分からないときは `['wiki', 'tree']` の前方一致で落とします。
 */
export function useWikiDbRefresh(pageId: string | undefined, spaceKey?: string | null) {
  const qc = useQueryClient();
  // ⚠️ **毎回同じものを返す**（`useEffect` の依存に書ける形にする）
  return useMemo(() => ({
    database() {
      if (pageId) void qc.invalidateQueries({ queryKey: wikiDbKeys.database(pageId) });
    },
    /** ビューごとに鍵が分かれているので、前方一致で全部落とす */
    rows() {
      if (pageId) void qc.invalidateQueries({ queryKey: ['wiki', 'database-rows', pageId] });
    },
    tree() {
      if (spaceKey) void qc.invalidateQueries({ queryKey: wikiKeys.tree(spaceKey) });
      else void qc.invalidateQueries({ queryKey: ['wiki', 'tree'] });
    },
  }), [qc, pageId, spaceKey]);
}

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
