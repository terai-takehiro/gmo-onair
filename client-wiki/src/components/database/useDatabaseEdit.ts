/**
 * データベースの書き込み（項目・ビュー・行）をまとめたフック
 *
 * ⚠️ **項目とビューは必ず2つ一緒に送ります**（`PUT /wiki/databases/:pageId`）。
 *    片方だけ送るとサーバーは保存せずに止めます（作りかけで列が全滅しないように）。
 *
 * ⚠️ **セルの保存では成功のお知らせを出しません。** 1文字直すたびに帯が出ると、
 *    表を埋めている間じゅう画面の上が点滅します。失敗したときだけ共通の受け皿
 *    （`meta.action`）が知らせます。
 */
import { useMutation } from '@tanstack/react-query';
import { notifyInfo, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import type { WikiItem, WikiPropValue, WikiRow, WikiView } from '@gmo-onair/shared/src/wiki/types';
import {
  createWikiRow,
  saveWikiDatabase,
  saveWikiRowProps,
  type WikiDatabaseDef,
} from './databaseApi';

interface Refresh {
  database: () => void;
  rows: () => void;
  tree: () => void;
}

interface DefinitionInput {
  items: WikiItem[];
  views: WikiView[];
  /** 画面に出す名前（「項目を保存しました」の「項目」） */
  what: string;
  dropValues?: boolean;
}

export interface DatabaseEdit {
  saving: boolean;
  saveItems: (items: WikiItem[], opts?: { dropValues?: boolean }) => void;
  saveViews: (views: WikiView[]) => void;
  /** 項目を消したときのように、**両方が同時に変わる**ときだけ使う */
  saveAll: (items: WikiItem[], views: WikiView[], what?: string) => void;
}

/** 項目とビューの保存。**いまの定義の `updated_at` を添える**ので、先に直した人がいれば 409 */
export function useDatabaseEdit(
  pageId: string,
  def: WikiDatabaseDef | undefined,
  refresh: Refresh,
): DatabaseEdit {
  const save = useMutation({
    meta: { action: 'データベースの設定を保存' },
    mutationFn: (v: DefinitionInput) =>
      saveWikiDatabase(pageId, {
        items: v.items,
        views: v.views,
        dropValues: v.dropValues,
        expected_updated_at: def?.updated_at,
      }),
    onSuccess: (data, v) => {
      refresh.database();
      refresh.rows();
      notifySuccess(`${v.what}を保存しました`);
      // 消した項目の値は既定では行に残す。黙って残すと「消えていない」と誤解される
      if (data.removed_item_ids?.length && !data.dropped_values) {
        notifyInfo('削除した項目の値は、各行に残したままにしています。');
      }
    },
  });

  return {
    saving: save.isPending,
    saveItems: (items, opts) =>
      save.mutate({ items, views: def?.views ?? [], what: '項目', dropValues: opts?.dropValues }),
    saveViews: (views) => save.mutate({ items: def?.items ?? [], views, what: 'ビュー' }),
    saveAll: (items, views, what = '項目') => save.mutate({ items, views, what }),
  };
}

/* ── 行の値 ───────────────────────────────────────────────── */

export interface RowValueSave {
  /** 保存中の行（その行の入力を止める） */
  savingRowId: string | null;
  commit: (row: WikiRow, item: WikiItem, value: WikiPropValue) => void;
}

export function useRowValueSave(refresh: Refresh): RowValueSave {
  const save = useMutation({
    meta: { action: '値を保存' },
    mutationFn: (v: { rowId: string; props: Record<string, WikiPropValue> }) =>
      saveWikiRowProps(v.rowId, v.props),
    onSuccess: () => refresh.rows(),
  });

  return {
    savingRowId: save.isPending ? (save.variables?.rowId ?? null) : null,
    commit: (row, item, value) => {
      // **いまの値ごと送る**（サーバーは送られた `props` で置き換える）
      const props: Record<string, WikiPropValue> = { ...(row.props ?? {}) };
      if (value === null || value === '') delete props[item.id];
      else props[item.id] = value;
      save.mutate({ rowId: row.id, props });
    },
  };
}

/* ── 行の追加 ─────────────────────────────────────────────── */

export function useRowCreate(pageId: string, refresh: Refresh) {
  return useMutation({
    meta: { action: '行を追加' },
    mutationFn: (title: string) => createWikiRow(pageId, { title }),
    onSuccess: () => {
      refresh.rows();
      // 行は子ページなのでツリーにも出る
      refresh.tree();
      notifySuccess('行を追加しました');
    },
  });
}
