/**
 * Wiki — データベース（項目とビューの定義）の読み書き。設計 §4-4・§6-⑩・§10 の判断3・3b・3c。
 *
 * **データベース＝「項目（列）を定義した親ページ」と「その子ページ（行）」**です。
 * ブロックでも別の保存形式でもなく、ページの種類（`wiki_pages.kind='database'`）。
 * 定義は親ページに1行（`wiki_databases`）、値は行ページの `wiki_pages.props`。
 *
 * ⚠️ **項目の id は `wiki_pages.props` のキーそのものです。**
 * 保存のときに id を送り返さないと新しい項目として発番され、**既存の行の値が
 * 全部その項目から外れて見えます**（値は残りますが、どの列にも出ません）。
 * だから「項目を消す」ときだけ、値も一緒に落とすかを `dropValues` で受けます。
 * 既定は**落とさない**——消したのが間違いだったとき、項目を同じ id で足し直せば戻るからです。
 *
 * ⚠️ **残した値が残り続けるのは「その行を保存し直すまで」です。** 画面は知らない項目を
 * 送らず、保存のたびに `sanitizeProps` が定義に無い値を落とします（§5-3-6）。
 * 消したのが間違いだったと気づいたら、**その行を触る前に**同じ id で足し直してください。
 *
 * ⚠️ **ビューの設定は保存され、開いた人全員に同じに見えます**（§6-⑩）。
 * 個人ごとの絞り込みは残しません（人によって行数が違う表は、電話で話が通じなくなる）。
 */
import {
  queryOne,
  withTransaction,
  type Row,
} from '../../../shared/db/connection';
import {
  NotFoundError,
  ValidationError,
  checkOptimisticLock,
} from '../../qsheet/services/httpErrors';
import type { WikiItem } from '../wiki-props';
import { assertReadablePage, type WikiUser } from './wiki-access.service';
import {
  defaultTableView,
  normalizeItems,
  normalizeViews,
  type WikiView,
} from './wiki-database-schema';

export interface WikiDatabaseDef {
  page_id: string;
  items: WikiItem[];
  views: WikiView[];
  updated_at: string;
  updated_by: string | null;
  updated_by_name?: string | null;
  /** この保存で定義から消えた項目の id（画面は「値は残しました」と伝える） */
  removed_item_ids?: string[];
  /** 消した項目の値を行から落としたか */
  dropped_values?: boolean;
}

const DEF_SELECT = `
  SELECT d.page_id, d.items, d.views, d.updated_at, d.updated_by, u.name AS updated_by_name
    FROM wiki_databases d
    LEFT JOIN users u ON u.id = d.updated_by
   WHERE d.page_id = ?
`;

/**
 * 時刻を ISO の文字にする。
 *
 * ⚠️ **`String(date)` にしないこと。** `pg` は TIMESTAMPTZ を `Date` で返すので、
 * `String()` だと `Tue Sep 22 2026 …` という人間向けの文字になります。ページの
 * 読み取り（`getPage`）は行をそのまま返していて `JSON.stringify` が ISO にするため、
 * **同じ `updated_at` が口ごとに違う形**になり、画面が突き合わせに使えなくなります。
 */
export function isoOf(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v ?? '');
}

function toDef(pageId: string, row: Row | undefined, fallbackUpdatedAt: unknown): WikiDatabaseDef {
  return {
    page_id: pageId,
    items: Array.isArray(row?.items) ? (row!.items as WikiItem[]) : [],
    views: Array.isArray(row?.views) ? (row!.views as WikiView[]) : [],
    updated_at: isoOf(row?.updated_at ?? fallbackUpdatedAt),
    updated_by: (row?.updated_by as string | null) ?? null,
    updated_by_name: (row?.updated_by_name as string | null) ?? null,
  };
}

/**
 * そのページがデータベースか確かめて、ページの行を返す。
 *
 * **読めるかを先に見ます**（`assertReadablePage` は読めないページを 404 にする）。
 * 読めるページがデータベースでないときだけ「データベースではありません」と言います —
 * 順番を逆にすると、読めないページの id を当てた人に「そこに何かある」ことが伝わります（§8）。
 */
export async function assertDatabasePage(user: WikiUser, pageId: string): Promise<Row> {
  await assertReadablePage(user, pageId);
  const page = await queryOne(
    'SELECT id, space_id, kind, title, updated_at FROM wiki_pages WHERE id = ? AND deleted_at IS NULL',
    [pageId],
  );
  if (!page) throw new NotFoundError('ページが見つかりません');
  if (page.kind !== 'database') {
    throw new ValidationError('このページはデータベースではありません。');
  }
  return page;
}

/** 項目とビューの定義（`GET /wiki/databases/:pageId`） */
export async function getDatabase(user: WikiUser, pageId: string): Promise<WikiDatabaseDef> {
  const page = await assertDatabasePage(user, pageId);
  const row = await queryOne(DEF_SELECT, [pageId]);
  return toDef(pageId, row, page.updated_at);
}

export interface PutDatabaseInput {
  items: unknown;
  views: unknown;
  /** 定義から消した項目の値を、全ての行から落とすか（既定は落とさない） */
  dropValues?: boolean;
  /** 画面が最後に受け取った定義の `updated_at`。食い違えば 409 */
  expected_updated_at?: string;
}

/**
 * 項目とビューをまとめて保存する（`PUT /wiki/databases/:pageId`・editor 以上）。
 *
 * ⚠️ **まるごと置き換えです。** `items` を送らない保存は「全部消す」になってしまうので、
 * 送っていないときは**保存せずに止めます**（画面の作りかけで列が全滅するのを防ぐ）。
 */
export async function putDatabase(
  user: WikiUser,
  pageId: string,
  input: PutDatabaseInput,
): Promise<WikiDatabaseDef> {
  await assertDatabasePage(user, pageId);
  if (input.items === undefined || input.views === undefined) {
    throw new ValidationError('項目とビューをまとめて送ってください。画面を読み込み直してください。');
  }
  const items = normalizeItems(input.items);
  const views = normalizeViews(input.views, items);

  let removedItemIds: string[] = [];
  let droppedValues = false;

  await withTransaction(async (tx) => {
    const cur = await tx.queryOne(
      `SELECT d.page_id, d.items, d.updated_at, d.updated_by,
              (SELECT u.name FROM users u WHERE u.id = d.updated_by) AS updater_name
         FROM wiki_databases d WHERE d.page_id = ? FOR UPDATE`,
      [pageId],
    );
    if (cur) {
      checkOptimisticLock(
        input.expected_updated_at,
        { updated_at: cur.updated_at, updated_by: cur.updated_by, updater_name: cur.updater_name },
        user.id,
        'この項目の一覧',
      );
      const before = Array.isArray(cur.items) ? (cur.items as WikiItem[]) : [];
      const kept = new Set(items.map((i) => i.id));
      removedItemIds = before.map((i) => i.id).filter((id) => !kept.has(id));
    }

    await tx.execute(
      `INSERT INTO wiki_databases (page_id, items, views, updated_at, updated_by)
       VALUES (?, ?::jsonb, ?::jsonb, NOW(), ?)
       ON CONFLICT (page_id) DO UPDATE
          SET items = EXCLUDED.items, views = EXCLUDED.views,
              updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
      [pageId, JSON.stringify(items), JSON.stringify(views), user.id],
    );

    /*
     * 消した項目の値を行から落とす。**既定では落とさない**（冒頭の注意書き）。
     *
     * ⚠️ **JSONB の `?|`（どれかのキーを持つか）は使えません。** この土台は SQL の
     * `?` をすべて placeholder に置き換えるので（`shared/db/connection.ts` の
     * `convertPlaceholders`）、`?|` が `$2|` になって壊れます。子ページは多くても
     * 数百件なので、全ての行に当てて済ませます。
     */
    if (input.dropValues === true && removedItemIds.length > 0) {
      await tx.execute(
        `UPDATE wiki_pages SET props = props - ?::text[]
          WHERE parent_id = ? AND deleted_at IS NULL`,
        [removedItemIds, pageId],
      );
      droppedValues = true;
    }
  });

  const saved = await getDatabase(user, pageId);
  return { ...saved, removed_item_ids: removedItemIds, dropped_values: droppedValues };
}

/**
 * ページの種類を切り替える（`PATCH /wiki/pages/:id` の `kind`）。
 *
 * ⚠️ **版（`rev`）と `updated_at` は増やしません。** 本文も題も変わらないので、
 * そのページを開いて書いている人の次の保存を「他の人が先に更新しました」で
 * 止めないためです（`wiki-write.service.ts` 冒頭の注記と同じ決め方）。
 *
 * ⚠️ **ふつうのページに戻しても、項目とビューの定義は消しません。**
 * 間違えて戻したときに、もう一度データベースにすれば列がそのまま返ってきます。
 * 行（子ページ）はそのまま子ページとして残ります。
 */
export async function setPageKind(
  user: WikiUser,
  pageId: string,
  kind: 'page' | 'database',
): Promise<void> {
  await assertReadablePage(user, pageId);
  const page = await queryOne(
    'SELECT id, kind FROM wiki_pages WHERE id = ? AND deleted_at IS NULL',
    [pageId],
  );
  if (!page) throw new NotFoundError('ページが見つかりません');
  if (page.kind === kind) return;

  await withTransaction(async (tx) => {
    await tx.execute('UPDATE wiki_pages SET kind = ? WHERE id = ? AND deleted_at IS NULL', [kind, pageId]);
    if (kind !== 'database') return;
    // 表のタブが1つも無い画面を出さないよう、最初の「表」を作っておく
    await tx.execute(
      `INSERT INTO wiki_databases (page_id, items, views, updated_by)
       VALUES (?, '[]'::jsonb, ?::jsonb, ?)
       ON CONFLICT (page_id) DO NOTHING`,
      [pageId, JSON.stringify([defaultTableView()]), user.id],
    );
  });
}

/** ビューを1本引く（`?view=` で指定されたもの）。無い id は「指定なし」と同じ扱い */
export function findView(views: WikiView[], viewId: string | undefined): WikiView | null {
  if (!viewId) return null;
  return views.find((v) => v.id === viewId) ?? null;
}

/** そのデータベースの項目とビュー（行の一覧・CSV が使う。読めるかは呼ぶ側で確かめ済み） */
export async function loadDefinition(pageId: string): Promise<{ items: WikiItem[]; views: WikiView[] }> {
  const row = await queryOne('SELECT items, views FROM wiki_databases WHERE page_id = ?', [pageId]);
  return {
    items: Array.isArray(row?.items) ? (row.items as WikiItem[]) : [],
    views: Array.isArray(row?.views) ? (row.views as WikiView[]) : [],
  };
}
