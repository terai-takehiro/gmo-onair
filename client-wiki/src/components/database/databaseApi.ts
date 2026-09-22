/**
 * データベース（段C）がサーバーを呼ぶところ
 *
 * ⚠️ **本来は `lib/wikiApi.ts` の `WIKI_URL` に並べます**（`client-wiki/CLAUDE.md`）。
 * 段C は「サーバー」「ビュー」を同時に書いているため、同じファイルを取り合わないよう
 * ここに分けています（`components/page/pageOpsApi.ts` と同じ扱い）。
 * **段C の検査でまとめて `WIKI_URL` へ移します。**
 *
 * サーバーの正は `server/src/contexts/wiki/routes/databases.routes.ts`:
 *   GET  /wiki/databases/:pageId           項目とビューの定義（reader）
 *   PUT  /wiki/databases/:pageId           項目とビューを**まとめて**保存（editor）
 *   GET  /wiki/databases/:pageId/rows      行の一覧（`?view=` でビューを当てる・reader）
 *   POST /wiki/databases/:pageId/rows      行を1本足す（題だけでよい・editor）
 *   GET  /wiki/databases/:pageId/rows.csv  書き出し（reader）
 *
 * **値の保存は段B の口をそのまま使います**（新しい口を作らない）:
 *   PATCH /wiki/pages/:rowId               行の値（`props` を丸ごと送る・editor）
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
  WikiPropValue,
  WikiRow,
  WikiView,
} from '@gmo-onair/shared/src/wiki/types';
import api from '@/lib/api';
import { wikiKeys } from '@/lib/wikiApi';

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
