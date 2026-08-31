import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { projectService, ProjectFilter } from '../services/project.service';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { generateCsv, csvResponse } from '../../../shared/utils/csv-export';
import { AppError } from '../../../shared/middleware/errorHandler';
import { config } from '../../../config';
import { recordProjectAccepted } from '../services/project-ai-feedback.service';
import multer from 'multer';
import {
  extractFolderId, isBoxConfigured, listFolderItems, MAX_UPLOAD_BYTES,
  getThumbnailStream, isImageName,
} from '../../../shared/services/box';
import { ensureSubfolder, PHOTOS_SUBFOLDER } from '../services/box-folder.service';
/**
 * 置き場所の読み方・フォルダの解決・上げ方は**プロジェクト管理と共通の1本**。
 * ここに書いたまま写すと、どちらかだけ直した日に片方が原価を外に出す。
 */
import {
  requireScope, requireFiles, projectFolderId, uploadFiles,
} from '../services/project-box-files.service';
import { createPhotoAccess } from '../services/project-photo-access.service';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

// 統合一覧（タブ: all/yomi/active/completed/lost）
router.get('/', async (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const filter: ProjectFilter = {
    search,
    stage: req.query.stage as string,
    assignedTo: req.query.assigned_to as string,
    tab: (req.query.tab as ProjectFilter['tab']) || 'all',
    glsCategory: req.query.gls_category as ProjectFilter['glsCategory'],
    issued: req.query.issued === '1' || req.query.issued === 'true',
    source: req.query.source === 'kessan' ? 'kessan' : undefined,
    kessanMarker: req.query.kessan_marker as string,
    aiCreated: req.query.ai_created === '1' || req.query.ai_created === 'true',
    aiReviewed: req.query.ai_reviewed === 'reviewed' ? 'reviewed'
      : req.query.ai_reviewed === 'unreviewed' ? 'unreviewed' : undefined,
    eventMonth: req.query.event_month as string,
    eventFrom: req.query.event_from as string,
    eventTo: req.query.event_to as string,
    // 健全性で絞る (stalled/overdue/snoozed)。知らない値は service 側が当たらない条件に落とす
    health: req.query.health as string,
    issue: req.query.issue as string,
    sortBy: req.query.sort_by as string,
    sortDir: (req.query.sort_dir as 'asc' | 'desc') || 'desc',
  };
  const { rows, total, stageCounts } = await projectService.list(filter, page, limit, offset);
  // stage_counts は v4 の案件一覧のチップに出す件数 (ステージ以外の絞り込みだけを掛けたもの)。
  // 既存の呼び出し側は data / pagination しか見ないので足しても壊れない
  res.json({ ...paginatedResponse(rows, total, page, limit), stage_counts: stageCounts });
});

// CSV Export
router.get('/export', requirePermission('sales', 'exporter'), async (_req, res) => {
  const rows = await queryAll(
    `SELECT p.gls_number, p.name, c.name as client_name, p.stage, p.expected_amount
     FROM projects p
     LEFT JOIN companies c ON c.id = p.customer_id
     WHERE p.deleted_at IS NULL
     ORDER BY p.created_at DESC`
  ) as Record<string, unknown>[];
  const columns = ['gls_number', 'name', 'client_name', 'stage', 'expected_amount'];
  csvResponse(res, 'projects.csv', generateCsv(rows, columns));
});

// GLS番号付き案件一覧（リンク先選択用）
router.get('/gls-projects', async (_req, res) => {
  res.json({ success: true, data: await projectService.getGlsProjects() });
});

// 受注確定済み案件一覧（仕入・売上など実務入力の案件プルダウン用。v4.1.8）
router.get('/won-projects', async (_req, res) => {
  res.json({ success: true, data: await projectService.getWonProjects() });
});

/**
 * 整合性チェックの件数（案件台帳の「確かめる」）。
 *
 * **`/:id` より前に置くこと** — 後ろに置くと `integrity` が案件の id として
 * 読まれ、404 になります（この製品の id は自由な文字列なので形では弾けません）。
 * 読むだけなので `sales` があれば誰でも（このルーターが入口で要求しています）。
 */
router.get('/integrity', async (_req, res) => {
  res.json({ success: true, data: await projectService.getIntegrity() });
});

// 決算インポートのマーカー (取込バッチ) 一覧
router.get('/kessan-markers', async (_req, res) => {
  res.json({ success: true, data: await projectService.getKessanMarkers() });
});

// 一括更新 (申し込み情報等のパラメータをまとめて変更)
router.patch('/bulk', requirePermission('sales', 'manager'), async (req, res) => {
  const { ids, set } = req.body || {};
  const result = await projectService.bulkUpdate(ids, set || {}, req.user!.id);
  res.json({ success: true, data: result });
});

// 詳細
router.get('/:id', async (req, res) => {
  const project = await projectService.getById(req.params.id as string) as Record<string, unknown>;
  // AI 起票判定: 監査ログ照合 (OAuth 経由の本人名義でも検出) OR created_by=mcpActor (静的キー)
  if (project) {
    const audit = await queryOne(
      `SELECT requested_by FROM mcp_audit_log
       WHERE tool_name = 'create_project' AND result_summary->>'created_id' = ?
       ORDER BY created_at ASC LIMIT 1`,
      [project.id]
    ) as Record<string, unknown> | null;
    project.is_ai_created = !!audit || project.created_by === config.mcpActorId;
    project.ai_requested_by = audit?.requested_by ?? null;
  }
  res.json({ success: true, data: project });
});

/**
 * AI 起票案件の内容確認を記録 (ホームの AI 起票インボックス / 案件編集のバナーから)。
 *
 * ⚠️ **「直さずに承認した」ことを記録する**（レビューでの指摘 #52）。
 * `ai_reviewed_at` は「人が見た」時刻でしかなく、**何が合っていたかを
 * 1バイトも残しません**。差分は直したときにしか書かれないので、
 * このひと押しを記録しないと**無修正採用が永久に 0 件**になります
 * （＝ AI がうまくいった回だけが数字に出ない）。
 */
router.post('/:id/ai-review', requirePermission('sales', 'editor'), async (req, res) => {
  // ai_reviewed_by は列を落とした（案件台帳の項目整理 Phase A・読み手ゼロ）。
  // 「誰が確認したか」は recordProjectAccepted 側の記録で足りる
  await execute(
    `UPDATE projects SET ai_reviewed_at = NOW(), updated_at = NOW()
     WHERE id = ? AND deleted_at IS NULL`,
    [req.params.id]
  );
  await recordProjectAccepted(req.params.id as string, req.user!.id);
  res.json({ success: true, data: { reviewed: true } });
});

// AI 起票案件の内容確認を一括記録 (案件一覧の複数選択→まとめて確認済みに)
router.post('/ai-review-bulk', requirePermission('sales', 'editor'), async (req, res) => {
  const ids: unknown = (req.body || {}).ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'ids は 1 件以上の配列で指定してください');
  }
  const idList = ids.filter((x): x is string => typeof x === 'string').slice(0, 500);
  if (idList.length === 0) throw new AppError(400, 'VALIDATION_ERROR', '有効な ID がありません');
  const placeholders = idList.map(() => '?').join(', ');
  // ai_reviewed_by は列を落とした（案件台帳の項目整理 Phase A・読み手ゼロ）
  await execute(
    `UPDATE projects SET ai_reviewed_at = NOW(), updated_at = NOW()
     WHERE id IN (${placeholders}) AND deleted_at IS NULL AND ai_reviewed_at IS NULL`,
    [...idList]
  );
  // まとめて確認した分も1件ずつ記録する（記録の入口を分けると必ず片方だけ抜ける）
  for (const id of idList) await recordProjectAccepted(id, req.user!.id);
  res.json({ success: true, data: { reviewed: idList.length } });
});

// サマリー（売上/仕入/粗利）
router.get('/:id/summary', async (req, res) => {
  res.json({ success: true, data: await projectService.getSummary(req.params.id as string) });
});

// 新規作成（ヨミ段階）
router.post('/', requirePermission('sales', 'editor'), async (req, res) => {
  const result = await projectService.create(req.body, req.user!.id);
  res.status(201).json({ success: true, data: result });
});

// 更新
router.put('/:id', requirePermission('sales', 'editor'), async (req, res) => {
  const result = await projectService.update(req.params.id as string, req.body, req.user!.id);
  res.json({ success: true, data: result });
});

// ステージ変更
router.patch('/:id/stage', requirePermission('sales', 'editor'), async (req, res) => {
  const { stage, ...rest } = req.body;
  const result = await projectService.changeStage(req.params.id as string, stage, rest, req.user!.id);
  res.json({ success: true, data: result });
});

/**
 * スヌーズ（再開日付きで意図して寝かせる・docs/core-redesign-plan.md §3-1）。
 * `{ until: 'YYYY-MM-DD' }` で設定（**未来日付のみ**）、`{ until: null }` で解除。
 * スヌーズ中は停滞にも自動整理にも出ない。期日が来たら勝手に普通の判定に戻る。
 */
router.patch('/:id/snooze', requirePermission('sales', 'editor'), async (req, res) => {
  const { until } = req.body || {};
  const result = await projectService.setSnooze(req.params.id as string, until ?? null, req.user!.id);
  res.json({ success: true, data: result });
});

/**
 * 次に出る GLS 番号を**採らずに**見る。
 *
 * 受注に上げる前の確認ダイアログが「GLS-A012 を採ります」と出すために使う。
 * **採番はしない**ので、先に別の人が発番すると1つ後ろになる（画面にそう書く）。
 */
router.get('/:id/next-gls', requirePermission('sales', 'reader'), async (req, res) => {
  res.json({ success: true, data: await projectService.peekGls(req.params.id as string) });
});

// GLS発番（受注に上げると `PATCH /:id/stage` から自動で呼ばれる。
// この口は「口頭決定のうちに先に番号が要る」ときのために残してある）
router.post('/:id/issue-gls', requirePermission('sales', 'editor'), async (req, res) => {
  const result = await projectService.issueGls(req.params.id as string, req.body, req.user!.id);
  res.json({ success: true, data: result });
});

// 案件分類の A↔B 切替 (発番済の場合は GLS 採番し直し + episode_code / BOX フォルダ自動更新)
router.patch('/:id/gls-category', requirePermission('sales', 'manager'), async (req, res) => {
  const { gls_category } = req.body || {};
  const result = await projectService.changeGlsCategory(req.params.id as string, gls_category, req.user!.id);
  res.json({ success: true, data: result });
});

/**
 * 案件の BOX フォルダにファイルを置く (v4 ⑥ 書類タブ)。
 *
 * ── 読み取りと違って、失敗は隠さない ────────────────────────
 *
 * 中身を出すほうは BOX が落ちていても 200 で返します（案件を止めないため）。
 * **置くほうは違います** — 上がっていないのに上がったように見えるのが一番困るので、
 * 理由を付けて失敗を返します。
 *
 * ── どこに置くかを画面に選ばせる ────────────────────────────
 *
 * 社内限り（発注・請求・原価）と社外共有（見積・台本・納品物）は
 * **取り違えると原価が外に出ます**。既定を持たず、`scope` を必須にします。
 */
const boxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 5 },
});

router.post(
  '/:id/box-files',
  requirePermission('sales', 'editor'),
  boxUpload.array('files', 5),
  async (req, res) => {
    // 置き場所の読み方・上げ方は**プロジェクト管理と同じ1本**
    // (`project-box-files.service`)。ルートに書いたまま写すと、
    // どちらかだけ直した日に片方が原価を外に出す
    const scope = requireScope(req.query.scope);
    // **順番を変えない。** ファイルを選ばずに押した人には
    // 「フォルダがありません」ではなく「ファイルを選んでください」を出す
    const files = requireFiles((req.files ?? []) as Express.Multer.File[]);
    const rootId = await projectFolderId(req.params.id as string, scope, {
      noFolder: 'この案件の BOX フォルダがまだ作られていません。'
        + 'GLS を発番するか、フォルダを作ってからお試しください。',
    });

    /*
     * 当日の写真 (v4 ⑥ ふりかえり)。`subfolder=photos` で
     * **社外と共有するフォルダの下の `08_写真`** に入れます。
     *
     * **社内限りには作りません。** 写真は報告資料の材料でお客様に出すものです。
     * 社内限りの下に貯めると、出したいときに出せません（逆に、社内限りのつもりの
     * 原価資料を写真として置かれると外に出ます）。だから `scope` も見て弾きます。
     *
     * `08_写真` は migration 186 の回で足したので、**それ以前の案件のフォルダには
     * 入っていません**。初回に無ければ作ります（`ensureSubfolder`）。
     */
    let folderId = rootId;
    if (req.query.subfolder === 'photos') {
      if (scope !== 'external') {
        throw new AppError(400, 'VALIDATION_ERROR',
          '写真は「社外と共有するフォルダ」に入れます（社内限りには置けません）。');
      }
      const photos = await ensureSubfolder(rootId, PHOTOS_SUBFOLDER);
      if (!photos) {
        throw new AppError(502, 'BOX_UNAVAILABLE', '写真のフォルダを用意できませんでした。あとでもう一度お試しください。');
      }
      folderId = photos.id;
    }

    const { uploaded: done, failed } = await uploadFiles(folderId, files);
    // **上げたら覚えているものを捨てる。** そうしないと、いま上げた写真の
    // サムネイルが「この案件の写真ではありません」で最大 1 分出ません
    if (req.query.subfolder === 'photos') photoAccess.forget(String(req.params.id));
    res.status(201).json({ success: true, data: { uploaded: done, failed } });
  },
);

/**
 * **溜まっている失注・見送り案件の BOX フォルダをまとめて片づける**（migration 248）。
 *
 * migration 248 は既存の失注案件を**遡って片づけません** — 本番の BOX で数百
 * フォルダが一斉に動くのを、人が知らないうちに起こさないためです。
 * 溜まっているぶんはこの口から、**人が押したときだけ**動かします。
 *
 * 1回に触る件数を必ず切ります（`limit`・既定20・上限100）。BOX は1フォルダにつき
 * 「読む→中身を数える→動かす」で数回叩くので、一度に数百件やると詰まります。
 * **押し直せば続きから進みます**（片づけ済みは `box_cleanup_state` で除かれる）。
 */
router.get('/box-cleanup/lost', requirePermission('sales', 'manager'), async (_req, res) => {
  // **0件なら画面に何も出さないため**の件数。出しっぱなしにすると
  // 「押しても減らない帯」になり、そのうち誰も読まなくなる
  res.json({ success: true, data: await projectService.countLostBoxFoldersToClean() });
});

router.post('/box-cleanup/lost', requirePermission('sales', 'manager'), async (req, res) => {
  const limit = Math.min(Math.max(Number(req.body?.limit) || 20, 1), 100);
  // `relink` は**まとめて処分の1回目だけ** true（親フォルダを丸ごと一覧し直すため）
  const result = await projectService.cleanupLostBoxFolders(limit, req.body?.relink === true);
  res.json({ success: true, data: result });
});

// BOX フォルダ手動作成 (既存案件向けバックフィル / 失敗ケースのリトライ)
router.post('/:id/create-box-folder', requirePermission('sales', 'manager'), async (req, res) => {
  const result = await projectService.createBoxFolder(req.params.id as string);
  res.json({ success: true, data: result });
});

/**
 * 案件の BOX フォルダの中身 (v4 ⑥ 書類タブ)。
 *
 * `scope=internal` 社内限り / `scope=external` 社外と共有。
 *
 * **BOX が落ちていても案件は止めない**というのがこのリポジトリの決めごと
 * (`shared/services/box.ts` の設計方針) なので、**失敗しても 200 で返し**、
 * `reason` に理由を入れます。画面はそれを「BOX につながりません」と出すだけで、
 * 案件詳細の他のタブは普通に使えます。500 にすると画面全体がエラーになります。
 */
router.get('/:id/box-files', async (req, res) => {
  const scope = req.query.scope === 'internal' ? 'internal' : 'external';
  const wantPhotos = req.query.subfolder === 'photos';
  const project = await queryOne(
    'SELECT box_url_internal, box_url_external FROM projects WHERE id = ? AND deleted_at IS NULL',
    [req.params.id]
  ) as { box_url_internal: string | null; box_url_external: string | null } | undefined;
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  const rootId = extractFolderId(
    scope === 'internal' ? project.box_url_internal : project.box_url_external
  );
  if (!rootId) {
    res.json({ success: true, data: [], reason: 'NO_FOLDER' });
    return;
  }
  if (!isBoxConfigured()) {
    res.json({ success: true, data: [], reason: 'NOT_CONFIGURED' });
    return;
  }
  try {
    /*
     * 写真のフォルダは**読むだけのときは作りません**。
     * 開いただけで空のフォルダが増えると、BOX 側が案件ごとのゴミで埋まります。
     * まだ無い＝1枚も無いので、空で返して画面に「まだありません」を出させます。
     */
    let folderId = rootId;
    if (wantPhotos) {
      const root = await listFolderItems(rootId);
      const photos = root.items.find((i) => i.type === 'folder' && i.name === PHOTOS_SUBFOLDER);
      if (!photos) {
        res.json({ success: true, data: [], total: 0, truncated: false });
        return;
      }
      folderId = photos.id;
    }
    const { items, total, truncated } = await listFolderItems(folderId);
    // 写真の一覧は**画像だけ**に絞る。間違って置かれた PDF が格子に並ぶと、
    // サムネイルの出ない枠が混ざって「壊れている」に見える
    const data = wantPhotos ? items.filter((i) => i.type === 'file' && isImageName(i.name)) : items;
    // **切ったことを渡す**（レビューでの指摘 #51）。前の版は 100 件で黙って
    // 切れており、101 枚目からの写真は画面に一度も出なかった
    res.json({ success: true, data, total: wantPhotos ? data.length : total, truncated });
  } catch (err) {
    console.error('[box] listFolderItems failed:', (err as Error).message);
    res.json({ success: true, data: [], reason: 'UNAVAILABLE' });
  }
});

/**
 * その案件の**写真フォルダ**（社外と共有する `08_写真`）にあるファイルの id。
 *
 * **無ければ作りません**（読むだけでフォルダを増やさない）。フォルダが無い＝
 * 写真は1枚も無いので `null` を返して、呼ぶ側は通しません。
 */
async function loadProjectPhotoIds(projectId: string): Promise<Set<string> | null> {
  const project = await queryOne(
    'SELECT box_url_external FROM projects WHERE id = ? AND deleted_at IS NULL',
    [projectId],
  ) as { box_url_external: string | null } | undefined;
  const rootId = extractFolderId(project?.box_url_external ?? null);
  if (!rootId) return null;
  try {
    const photos = (await listFolderItems(rootId)).items
      .find((i) => i.type === 'folder' && i.name === PHOTOS_SUBFOLDER);
    if (!photos) return null;
    const { items } = await listFolderItems(photos.id);
    return new Set(items.filter((i) => i.type === 'file').map((i) => i.id));
  } catch (err) {
    // BOX が落ちているときは**通さない**。ここで通すと、障害の日だけ確認が消える
    console.warn('[box] 写真の持ち主を確かめられませんでした:', (err as Error).message);
    return null;
  }
}

/**
 * 持ち主の確認。**案件ごとに短く覚えます** — 写真の格子は `<img>` ごとに
 * 別のリクエストなので、毎回2回 BOX に訊くと 100 枚で 200 回になり、
 * **絞られて正しい写真まで 404 になります**（`project-photo-access.service` に理由）。
 */
const photoAccess = createPhotoAccess(loadProjectPhotoIds);

/**
 * 写真のサムネイル。**画像をこちらに複製しません** — BOX が作ったものを流すだけです。
 *
 * ── なぜ中継するのか ────────────────────────────────────────
 *
 * BOX の URL を画面に直接貼ると、**ログインしていない人にも見える形**にするか、
 * 利用者ごとの BOX ログインを要求するかのどちらかになります。ONAiR は
 * アプリの権限で見せたいので、サーバーが取りに行って流します。
 *
 * ── 出せないときは 404 にする ────────────────────────────────
 *
 * 変換中・対応していない形式・契約プランで使えない、のどれでも起こります。
 * **画面はファイル名だけの表示に落とします** — 絵が出ないのは我慢できますが、
 * 500 にすると案件詳細ごと落ちます。
 */
router.get('/:id/box-files/:fileId/thumbnail', async (req, res) => {
  if (!isBoxConfigured()) throw new AppError(404, 'NOT_CONFIGURED', 'この環境は BOX につないでいません');
  /*
   * ⚠️ **その案件の写真かどうかを必ず確かめる。**
   *
   * 以前はここで `fileId` をそのまま BOX に渡していました。`:id`（案件）は
   * URL に入っているだけで**一度も読まれていなかった**ので、`sales` の権限さえ
   * あれば**別の案件の写真でも、社内限りフォルダの資料でも**、id を渡せば
   * 中身（サムネイル）を取り出せました。id は一覧の応答に出るので推測は要りません。
   *
   * 確かめ方は**その案件の写真フォルダに実在するか**です（BOX に持ち主を訊く形に
   * すると、フォルダを移した写真が「持ち主は合っているのに別の場所」で通ってしまう）。
   */
  const fileId = String(req.params.fileId);
  if (!(await photoAccess.isProjectPhoto(String(req.params.id), fileId))) {
    throw new AppError(404, 'NOT_FOUND', 'この案件の写真ではありません');
  }
  try {
    const stream = await getThumbnailStream(fileId);
    res.setHeader('Content-Type', 'image/jpeg');
    // 同じ写真を何度も取りに行かない。**こちらには残さない**ので、持つのはブラウザ側だけ
    res.setHeader('Cache-Control', 'private, max-age=3600');
    stream.pipe(res);
  } catch (err) {
    console.warn('[box] thumbnail failed:', (err as Error).message);
    throw new AppError(404, 'NO_THUMBNAIL', 'サムネイルを出せませんでした');
  }
});

// 既存GLS案件へのリンク（エピソード追加）
router.post('/:id/link-gls', requirePermission('sales', 'editor'), async (req, res) => {
  const { target_project_id } = req.body;
  const result = await projectService.linkToExistingGls(req.params.id as string, target_project_id, req.user!.id);
  res.json({ success: true, data: result });
});

// 発番済みの案件を別の既存GLSのエピソードへ紐づけ直す (旧GLSは履歴に保存)
router.post('/:id/relink-gls', requirePermission('sales', 'manager'), async (req, res) => {
  const { target_project_id } = req.body;
  const result = await projectService.relinkExistingGls(req.params.id as string, target_project_id, req.user!.id);
  res.json({ success: true, data: result });
});

// 削除
router.delete('/:id', requirePermission('sales', 'manager'), async (req, res) => {
  await projectService.delete(req.params.id as string, req.user!.id);
  res.json({ success: true, message: '削除しました' });
});

export default router;
