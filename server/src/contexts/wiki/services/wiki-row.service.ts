/**
 * Wiki — データベースの行（＝子ページ）。設計 §4-4・§6-⑩・§10 の判断3b。
 *
 * **行はページです。** 一覧は読むときに子ページを集めて作り（保存しない）、
 * 値は各行ページの `wiki_pages.props` にあります。行を押すとその行ページが開き、
 * ページ②と同じ画面の「情報」欄に項目の値が並びます。
 *
 * ⚠️ **絞り込みと並べ替えはここ（サーバー）で当てます**（`wiki-view-apply.ts`）。
 * 表・ボード・カレンダー・CSV が同じ答えを見るためです。
 *
 * ⚠️ **行は既定で公開**（`published`）にします。下書きで作ると**作った本人にしか
 * 見えない行**になり、共有の表として成り立ちません（ツリーと同じ規則で隠れます）。
 */
import { queryAll, type Row } from '../../../shared/db/connection';
import { ValidationError } from '../../qsheet/services/httpErrors';
import type { WikiItem, WikiPropValue } from '../wiki-props';
import { type WikiUser } from './wiki-access.service';
import {
  assertDatabasePage,
  findView,
  isoOf,
  loadDefinition,
} from './wiki-database.service';
import type { WikiView } from './wiki-database-schema';
import { assertOnairTargetsExist, assertPersonsEligible, databaseItems, validateRowProps } from './wiki-row-props';
import { savePageInternal } from './wiki-page.service';
import { createPage } from './wiki-write.service';
import { applyView } from './wiki-view-apply';

/**
 * 1つのデータベースから取り出す行の上限。
 *
 * ⚠️ **絞り込みを当てる前の数**です。ここを外すと、間違って何万件もぶら下げた
 * データベースを開いた1人が、サーバーのメモリを食い潰します。
 * 超えたときは画面に出す用の印（`truncated`）を返します。
 */
const MAX_ROWS = 2000;

export interface WikiRowOut {
  id: string;
  title: string;
  icon: string | null;
  status: string;
  props: Record<string, WikiPropValue>;
  sort_order: number;
  updated_at: string;
  updated_by: string | null;
  updater_name: string | null;
}

function toRow(row: Row): WikiRowOut {
  return {
    id: String(row.id),
    title: String(row.title),
    icon: (row.icon as string | null) ?? null,
    status: String(row.status),
    props: (row.props as Record<string, WikiPropValue>) ?? {},
    sort_order: Number(row.sort_order ?? 0),
    updated_at: isoOf(row.updated_at),
    updated_by: (row.updated_by as string | null) ?? null,
    updater_name: (row.updater_name as string | null) ?? null,
  };
}

/**
 * 行の生データ（絞り込み前）。
 *
 * 出すのは**公開の行と自分の下書き**です（ツリー・`getSpaceTree` と同じ規則）。
 * `archived` は出しません（「一覧から隠す」がそのまま表からも隠す、で揃える）。
 */
async function rawRows(user: WikiUser, pageId: string): Promise<WikiRowOut[]> {
  const rows = await queryAll(
    `SELECT p.id, p.title, p.icon, p.status, p.props, p.sort_order, p.updated_at,
            p.updated_by, u.name AS updater_name
       FROM wiki_pages p
       LEFT JOIN users u ON u.id = p.updated_by
      WHERE p.parent_id = ? AND p.deleted_at IS NULL
        AND (p.status = 'published' OR (p.status = 'draft' AND p.created_by = ?))
      ORDER BY p.sort_order, p.title
      LIMIT ${MAX_ROWS + 1}`,
    [pageId, user.id],
  );
  return rows.map(toRow);
}

export interface WikiRowsResult {
  page_id: string;
  /** 当てたビュー（指定が無い・見つからないときは null） */
  view_id: string | null;
  items: WikiItem[];
  views: WikiView[];
  rows: WikiRowOut[];
  /** 上限に達して切ったか。画面は「絞り込んでください」と案内する */
  truncated: boolean;
}

/**
 * 行の一覧（`GET /wiki/databases/:pageId/rows`）。
 * `view` を渡すと、そのビューの絞り込み・並べ替えを当てたものを返します。
 */
export async function listRows(
  user: WikiUser,
  pageId: string,
  viewId?: string,
): Promise<WikiRowsResult> {
  await assertDatabasePage(user, pageId);
  const { items, views } = await loadDefinition(pageId);
  const all = await rawRows(user, pageId);
  const truncated = all.length > MAX_ROWS;
  const view = findView(views, viewId);
  return {
    page_id: pageId,
    view_id: view?.id ?? null,
    items,
    views,
    rows: applyView(truncated ? all.slice(0, MAX_ROWS) : all, view, items),
    truncated,
  };
}

/**
 * CSV の書き出しに使う一式（一覧と同じ絞り込みを通す）。
 *
 * ⚠️ **上限に達したら書き出さずに止めます。** 一覧は画面に「切りました」と出せますが、
 * 落としたファイルには何も書いてありません。**足りない CSV を渡すほうが、
 * 書き出せないと言われるより悪い**（数えた数が合わないことに誰も気づかない）。
 */
export async function rowsForCsv(
  user: WikiUser,
  pageId: string,
  viewId?: string,
): Promise<{ title: string; items: WikiItem[]; view: WikiView | null; rows: WikiRowOut[] }> {
  const page = await assertDatabasePage(user, pageId);
  const { items, views } = await loadDefinition(pageId);
  const all = await rawRows(user, pageId);
  if (all.length > MAX_ROWS) {
    throw new ValidationError(
      `行が ${MAX_ROWS} 件を超えているため書き出せません。ビューで絞り込んでから書き出してください。`,
    );
  }
  const view = findView(views, viewId);
  return { title: String(page.title), items, view, rows: applyView(all, view, items) };
}

export interface CreateRowInput {
  title?: string;
  /** 最初から値を入れて作る（任意）。**ページを作る前に**項目定義で検査する */
  props?: Record<string, unknown>;
}

/**
 * 行を1本足す（`POST /wiki/databases/:pageId/rows`）。
 *
 * **題を打つだけで作れます**（§6-⑩）。作られるのは子ページなので、ツリーにも出ます。
 * `props` を添えると、作ったあとに続けて値を入れます（版が2つになりますが、
 * 「作った」と「値を入れた」が履歴で分かれるのはむしろ読みやすい）。
 * 値が項目の型に合わないときは**1行も作らずに止めます**（下の注意書き）。
 */
export async function createRow(
  user: WikiUser,
  pageId: string,
  input: CreateRowInput,
): Promise<Row> {
  const page = await assertDatabasePage(user, pageId);
  const title = String(input.title ?? '').trim();
  if (title.length > 200) throw new ValidationError('題は 200 文字までです。');

  /*
   * ⚠️ **値の検査はページを作る前に。** あとから検査すると、「数字で入れてください」と
   * 言いながら**空の行だけが表に残ります**（作成と値の保存が別の処理なので、
   * 片方だけ成功する）。実際にそうなっていたのを検証で見つけて直しました。
   */
  let props: Record<string, WikiPropValue> | null = null;
  if (input.props && Object.keys(input.props).length > 0) {
    const items = await databaseItems(pageId);
    props = validateRowProps(items, input.props as Record<string, WikiPropValue>);
    await assertOnairTargetsExist(items, props);
    // 人の項目も**作る前に**（#740 の Codex 指摘・P2。あとの保存で断ると空の行が残る）
    await assertPersonsEligible(items, props, {});
  }

  const created = await createPage(user, {
    space_id: String(page.space_id),
    parent_id: pageId,
    title: title || undefined,
    status: 'published',
  });

  if (props && Object.keys(props).length > 0) {
    return savePageInternal(String(created.id), { props, note: '行の値を入れた' }, user);
  }
  return created;
}
