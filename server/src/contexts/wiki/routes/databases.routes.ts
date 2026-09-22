/**
 * Wiki — データベース（項目・ビュー・行）の API（段C）。
 * 設計: `docs/design/v4/wiki.md` §4-4・§5-2 の約束3・§5-3-6・§6-⑩・§10 の判断3・3b・3c。
 *
 * - `GET  /wiki/databases/:pageId`          項目とビューの定義
 * - `PUT  /wiki/databases/:pageId`          項目とビューをまとめて保存（editor）
 * - `GET  /wiki/databases/:pageId/rows`     行の一覧（`?view=` でビューを当てる）
 * - `POST /wiki/databases/:pageId/rows`     行を1本足す（題だけでよい・editor）
 * - `GET  /wiki/databases/:pageId/rows.csv` 書き出し（Notion と同じ形・1行目が項目名）
 *
 * 権限（§8）: 読み取りは reader、項目・ビュー・行の追加は editor。
 * **読めないページは 403 ではなく 404**（存在ごと隠す）——`assertReadablePage` が投げます。
 *
 * ⚠️ **`rows.csv` は `/rows` より先に登録しています。** Express は登録順に照合するので、
 * `:pageId` を含む道が先にあると `rows.csv` が `:pageId` の一部として食われかねません。
 * （いまの形では道が分かれるので衝突しませんが、順番に意味があることを残しておきます。）
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { ValidationError } from '../../qsheet/services/httpErrors';
import { getDatabase, putDatabase } from '../services/wiki-database.service';
import { listRows, createRow, rowsForCsv } from '../services/wiki-row.service';
import { buildRowsCsv, csvFileName } from '../services/wiki-row-csv';
import { wrap, p1 } from './wrap';

const router = Router();
const canRead = [requireAuth, requirePermission('wiki', 'reader')] as const;
const canEdit = [requireAuth, requirePermission('wiki', 'editor')] as const;

function body(req: { body?: unknown }): Record<string, unknown> {
  const b = req.body;
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

/** `?view=` は1つだけ。配列で来たら最初の1つを見る（`p1` と同じ考え方） */
function viewId(raw: unknown): string | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === 'string' && v ? v : undefined;
}

/** 項目とビューの定義 */
router.get('/databases/:pageId', ...canRead, wrap(async (req, res) => {
  const def = await getDatabase(req.user!, p1(req.params.pageId));
  res.json({ success: true, data: def });
}));

/**
 * 項目とビューをまとめて保存する。
 *
 * ⚠️ **項目の id を送り返してください。** 送らないと新しい項目として発番され、
 * 既存の行の値がその列から外れて見えます（値そのものは残ります）。
 * 項目を**消した**ときは、その値を全ての行から落とすかを `dropValues` で指定します
 * （既定は落とさない）。
 */
router.put('/databases/:pageId', ...canEdit, wrap(async (req, res) => {
  const b = body(req);
  const def = await putDatabase(req.user!, p1(req.params.pageId), {
    items: b.items,
    views: b.views,
    dropValues: b.dropValues === true,
    expected_updated_at: typeof b.expected_updated_at === 'string' ? b.expected_updated_at : undefined,
  });
  res.json({ success: true, data: def });
}));

/**
 * 書き出し（CSV）。**Notion の書き出しと同じ形**（1行目が項目名・1列目が題）。
 * `?view=` を付けると、その表に出ている行・列・並び順のまま落とせます。
 */
router.get('/databases/:pageId/rows.csv', ...canRead, wrap(async (req, res) => {
  const { title, items, view, rows } = await rowsForCsv(
    req.user!, p1(req.params.pageId), viewId(req.query.view),
  );
  const csv = buildRowsCsv(items, rows, view?.columns);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(csvFileName(title))}`,
  );
  res.send(csv);
}));

/**
 * 行の一覧。`?view=` を渡すと、そのビューの絞り込み・並べ替えを**サーバーで**当てます
 * （表・ボード・カレンダーが同じ答えを見るため。§6-⑩）。
 */
router.get('/databases/:pageId/rows', ...canRead, wrap(async (req, res) => {
  const result = await listRows(req.user!, p1(req.params.pageId), viewId(req.query.view));
  res.json({ success: true, data: result });
}));

/** 行を1本足す（題を打つだけでよい）。作られるのは子ページなのでツリーにも出ます */
router.post('/databases/:pageId/rows', ...canEdit, wrap(async (req, res) => {
  const b = body(req);
  if (b.title !== undefined && typeof b.title !== 'string') {
    throw new ValidationError('題は文字で入れてください。');
  }
  if (b.props !== undefined && (!b.props || typeof b.props !== 'object' || Array.isArray(b.props))) {
    throw new ValidationError('項目の値を保存できませんでした。入力を確かめてください。');
  }
  const row = await createRow(req.user!, p1(req.params.pageId), {
    title: b.title as string | undefined,
    props: b.props as Record<string, unknown> | undefined,
  });
  res.status(201).json({ success: true, data: row });
}));

export default router;
