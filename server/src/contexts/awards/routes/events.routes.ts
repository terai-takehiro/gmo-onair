import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execute, queryAll, queryOne, getDb } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { importAwardsExcel, previewAwardsExcel } from '../services/excel-import.service';
import type { ImportMapping } from '../services/excel-import.service';
import {
  uploadAwardsImageToBox,
  invalidateEventFolderCache,
  listEventBackups,
  downloadEventBackupImages,
} from '../services/awards-box.service';
import { fetchEventSurveys } from '../services/survey-output.service';
import { getOnAir, buildOutputUrl, OUTPUT_USES, KEY_OPS, LAYERS, LEFTOVER_MINUTES } from '../services/onair.service';
import {
  TEMPLATES, assertTemplate, previewPasted, importPasted, tidyWithAi,
  recordIntakeCorrections, recordIntakeOutcome, recordIntakeDropped, PASTE_MAX_CHARS,
} from '../services/awards-intake.service';

const UPLOAD_DIR = path.join(__dirname, '../../../../../uploads/awards');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAGIC: Record<string, number[]> = {
  '.jpg':  [0xFF, 0xD8, 0xFF],
  '.png':  [0x89, 0x50, 0x4E, 0x47],
  '.webp': [0x52, 0x49, 0x46, 0x46],
};
function detectExt(buf: Buffer): string | null {
  for (const [ext, sig] of Object.entries(MAGIC)) {
    if (sig.every((b, i) => buf[i] === b)) return ext;
  }
  return null;
}

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── 公開: CG出力用（認証不要・ブラウザソース用）──────────────
router.get('/events/:id/output', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const event = await queryOne(`SELECT id, name, subtitle FROM awards_events WHERE id = ?`, [id]);
  if (!event) { res.status(404).json({ success: false }); return; }

  const categories = await queryAll(
    `SELECT * FROM awards_categories WHERE event_id = ? ORDER BY display_order, id`, [id]
  );
  const entries = await queryAll(
    `SELECT * FROM awards_entries WHERE event_id = ? ORDER BY category_id, rank NULLS LAST, id`, [id]
  );

  const catMap = new Map<number, Record<string, unknown> & { entries: unknown[] }>();
  for (const c of categories) catMap.set(c.id as number, { ...c, entries: [] });
  for (const e of entries) catMap.get(e.category_id as number)?.entries.push(e);

  const surveys = await fetchEventSurveys(id);

  res.json({ success: true, data: { ...event, categories: [...catMap.values()], surveys } });
}));

// v2.8.95: パススコープを明示。`router.use(mw)` (パス無し) は router 内のすべての
// リクエストで発火するため、`/awards/images/...` 等の他 router 担当のパスが
// この router を通過する際に誤って 401 で蹴られる不具合を起こしていた。
router.use(['/events', '/box-backups'], requireAuth, requirePermission('awards'));

// v2.9.89: 統合送出コックピット — 全レイヤー ON-AIR 状態 (badge 用、operator が常時監視)。
//   3 レイヤー (ランキング awards_cue_state / 字幕 awards_oneshot_cue_state /
//   クイズ quiz_stack_state) の live 状態をまとめて返す。socket は不変。
router.get('/events/:id/cg-status', wrap(async (req, res) => {
  const eventId = parseInt(req.params.id as string);
  const ranking = await queryOne(`SELECT step FROM awards_cue_state WHERE event_id = ?`, [eventId]);
  const oneshot = await queryOne(`SELECT is_live FROM awards_oneshot_cue_state WHERE event_id = ?`, [eventId]);
  const quiz = await queryOne(`SELECT step FROM quiz_stack_state WHERE event_id = ?`, [eventId]);
  const rStep = (ranking?.step as string) ?? 'idle';
  const qStep = (quiz?.step as string) ?? 'idle';
  res.json({
    success: true,
    data: {
      ranking: { live: rStep !== 'idle', step: rStep },
      oneshot: { live: !!oneshot?.is_live },
      quiz: { live: qStep !== 'idle', step: qStep },
    },
  });
}));

// ── 送出（本番中に見る唯一の画面。20章 24a）──────────────────
//
// 本番は1画面・準備は別画面。ここが返すのは**見せ方の情報だけ**で、
// TAKE / CLEAR は既存の `/cue` `/oneshot/cue` をそのまま使う
// (出る絵は1バイトも変わらない)。
router.get('/events/:id/onair', wrap(async (req, res) => {
  res.json({ success: true, data: await getOnAir(parseInt(req.params.id as string)) });
}));

// 送出の決まり (イベントに依らない)。キー操作の一覧などを画面に出すのに使う
// `router.use(['/events', ...])` はパス指定なのでここは通らない → 明示的に守る
router.get('/onair/format', requireAuth, requirePermission('awards'), wrap(async (_req, res) => {
  res.json({
    success: true,
    data: { keys: KEY_OPS, layers: LAYERS, output_uses: OUTPUT_USES, leftover_minutes: LEFTOVER_MINUTES },
  });
}));

// 出力URLの配り方 (24b)。?bg=1 / ?audio=1 / ?lang=en を人に組み立てさせない
router.get('/events/:id/output-url', wrap(async (req, res) => {
  res.json({
    success: true,
    data: buildOutputUrl({
      eventId: parseInt(req.params.id as string),
      use: String(req.query.use ?? 'ranking'),
      audio: req.query.audio === '1' || req.query.audio === 'true',
      lang: String(req.query.lang ?? 'ja'),
      opaque: req.query.opaque === '1' || req.query.opaque === 'true',
    }),
  });
}));

// ── テンプレート (20e)。実装しているのはアワードだけ ─────────
//
// 一覧から隠さない。隠すと「うちの演出は作れないのか」が分からず毎回聞かれる。
// **出すが作れない**ことをその場で言う。
router.get('/templates', requireAuth, requirePermission('awards'), wrap(async (_req, res) => {
  res.json({ success: true, data: { templates: TEMPLATES, paste_max_chars: PASTE_MAX_CHARS } });
}));

// ── 一覧 ────────────────────────────────────────────────────
router.get('/events', wrap(async (_req, res) => {
  const rows = await queryAll(
    `SELECT id, name, subtitle, description, scheduled_at, status, template, created_at, updated_at
     FROM awards_events ORDER BY scheduled_at DESC NULLS LAST, id DESC`
  );
  res.json({ success: true, data: rows });
}));

// ── 作成 ────────────────────────────────────────────────────
router.post('/events', wrap(async (req, res) => {
  const { name, subtitle, description, scheduled_at } = req.body;
  if (!name?.trim()) throw new AppError(400, 'BAD_REQUEST', 'name は必須です');
  // 画面でも選べないようにしているが、画面だけの制限は必ず抜ける (20e)
  const template = assertTemplate(req.body.template);

  const row = await queryOne(
    `INSERT INTO awards_events (name, subtitle, description, scheduled_at, template)
     VALUES (?, ?, ?, ?, ?) RETURNING *`,
    [name.trim(), subtitle ?? null, description ?? null, scheduled_at ?? null, template]
  );
  res.status(201).json({ success: true, data: row });
}));

// ── 詳細（カテゴリ＋エントリ込み）───────────────────────────
router.get('/events/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const event = await queryOne(`SELECT * FROM awards_events WHERE id = ?`, [id]);
  if (!event) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

  const categories = await queryAll(
    `SELECT * FROM awards_categories WHERE event_id = ? ORDER BY display_order, id`, [id]
  );
  const entries = await queryAll(
    `SELECT * FROM awards_entries WHERE event_id = ? ORDER BY category_id, rank NULLS LAST, id`, [id]
  );

  const catMap = new Map<number, Record<string, unknown> & { entries: unknown[] }>();
  for (const c of categories) {
    catMap.set(c.id as number, { ...c, entries: [] });
  }
  for (const e of entries) {
    catMap.get(e.category_id as number)?.entries.push(e);
  }

  // v2.9.63: operator (ControlPage) のプレビュー/ステップ出し分け用に連動アンケートも返す
  const surveys = await fetchEventSurveys(id);

  res.json({ success: true, data: { ...event, categories: [...catMap.values()], surveys } });
}));

// ── 更新 ────────────────────────────────────────────────────
router.put('/events/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { name, subtitle, description, scheduled_at } = req.body;
  if (!name?.trim()) throw new AppError(400, 'BAD_REQUEST', 'name は必須です');

  const row = await queryOne(
    `UPDATE awards_events SET name=?, subtitle=?, description=?, scheduled_at=?, updated_at=NOW()
     WHERE id=? RETURNING *`,
    [name.trim(), subtitle ?? null, description ?? null, scheduled_at ?? null, id]
  );
  if (!row) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');
  res.json({ success: true, data: row });
}));

// ── ステータス変更 ───────────────────────────────────────────
router.post('/events/:id/status', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { status } = req.body;
  if (!['draft', 'live', 'closed'].includes(status)) {
    throw new AppError(400, 'BAD_REQUEST', 'status は draft/live/closed のいずれか');
  }
  const row = await queryOne(
    `UPDATE awards_events SET status=?, updated_at=NOW() WHERE id=? RETURNING *`,
    [status, id]
  );
  if (!row) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');
  res.json({ success: true, data: row });
}));

// ── 削除 ────────────────────────────────────────────────────
// イベント削除時はローカル画像 (/app/uploads/awards/) も物理削除する。
// BOX 上の `11_awards_photo/event_{id}_{name}/` フォルダは触らないので、
// あとから「BOX バックアップから復元」エンドポイントで再作成可能。
router.delete('/events/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);

  // 1) このイベントに紐づく全エントリの photo_url を取得
  const photos = await queryAll(
    `SELECT photo_url FROM awards_entries WHERE event_id=? AND photo_url IS NOT NULL`,
    [id]
  ) as { photo_url: string }[];

  // 2) DB から削除（cascade で categories / entries / cue_state も消える）
  const row = await queryOne(`DELETE FROM awards_events WHERE id=? RETURNING id`, [id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

  // 3) ローカルファイルを物理削除
  let localDeleted = 0;
  for (const p of photos) {
    const filename = path.basename(p.photo_url);
    if (!filename || filename.includes('..')) continue;
    const fp = path.join(UPLOAD_DIR, filename);
    try {
      if (fs.existsSync(fp)) {
        fs.unlinkSync(fp);
        localDeleted++;
      }
    } catch (err) {
      console.warn(`[awards] Failed to unlink ${fp}:`, (err as Error).message);
    }
  }

  // 4) BOX フォルダのキャッシュをクリア（BOX 上のフォルダ自体は残す）
  invalidateEventFolderCache(id);

  console.log(`[awards] Event ${id} deleted. Local files removed: ${localDeleted}/${photos.length}. BOX folder retained.`);
  res.json({ success: true, data: { localFilesDeleted: localDeleted } });
}));

// ── BOX バックアップ一覧 (削除済みイベントの復元候補) ────────
router.get('/box-backups', wrap(async (_req, res) => {
  const backups = await listEventBackups();

  // 既に DB に存在する eventId は除外したいので、現存イベントの id を引く
  const existing = await queryAll(`SELECT id FROM awards_events`) as { id: number }[];
  const existingIds = new Set(existing.map((e) => e.id));

  // 「削除済み」フラグを付加
  const enriched = backups.map((b) => ({
    ...b,
    deleted: !existingIds.has(b.eventId),
  }));
  res.json({ success: true, data: enriched });
}));

// ── BOX バックアップから復元 ─────────────────────────────────
// body: { name, subtitle?, scheduledAt? }
// folderId: 復元元の BOX フォルダ ID（/box-backups で取得した folderId）
router.post('/box-backups/:folderId/restore', wrap(async (req, res) => {
  const folderId = String(req.params.folderId);
  const { name, subtitle, scheduledAt } = req.body as {
    name?: string;
    subtitle?: string;
    scheduledAt?: string;
  };
  if (!name?.trim()) throw new AppError(400, 'BAD_REQUEST', 'name は必須です');

  // 1) 新規イベント作成
  const newEvent = await queryOne(
    `INSERT INTO awards_events (name, subtitle, scheduled_at)
     VALUES (?, ?, ?) RETURNING id, name`,
    [name.trim(), subtitle ?? null, scheduledAt ?? null]
  ) as { id: number; name: string };

  // 2) BOX フォルダから全画像をローカルに復元
  const restored = await downloadEventBackupImages(folderId, UPLOAD_DIR);

  // 3) 復元用カテゴリ + ノミネートを作成（とりあえず 1 カテゴリに全画像をぶら下げる）
  let entriesCreated = 0;
  if (restored.length > 0) {
    const cat = await queryOne(
      `INSERT INTO awards_categories (event_id, name, description, display_order)
       VALUES (?, ?, ?, ?) RETURNING id`,
      [newEvent.id, '復元', 'BOX バックアップから復元', 1]
    ) as { id: number };

    for (let i = 0; i < restored.length; i++) {
      const r = restored[i];
      const photoUrl = `/api/v1/internal/awards/images/${r.localFilename}`;
      const placeholderName = `復元 #${i + 1}`;
      await execute(
        `INSERT INTO awards_entries
           (event_id, category_id, name, photo_url, photo_box_file_id, is_winner)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [newEvent.id, cat.id, placeholderName, photoUrl, r.boxFileId, false]
      );
      entriesCreated++;
    }
  }

  res.json({
    success: true,
    data: {
      eventId: newEvent.id,
      filesRestored: restored.length,
      entriesCreated,
    },
  });
}));

// ── Excel プレビュー (列マッピング UI 用) ───────────────────
// アップロードされた Excel を解析して headers / sampleRows / 推奨マッピングを返す。
// クライアントは UI 上で各 CG 項目に対する Excel 列を選択し、import-excel に
// `mapping` (JSON 文字列) として送り直す。
router.post('/events/:id/import-preview', upload.single('file'), wrap(async (req, res) => {
  const eventId = parseInt(req.params.id as string);
  const event = await queryOne(`SELECT id FROM awards_events WHERE id=?`, [eventId]);
  if (!event) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');
  if (!req.file) throw new AppError(400, 'BAD_REQUEST', 'Excel ファイルを添付してください');

  const result = previewAwardsExcel(req.file.buffer);
  res.json({ success: true, data: result });
}));

// ── Excel インポート (custom mapping 受け入れ) ──────────────
router.post('/events/:id/import-excel', upload.single('file'), wrap(async (req, res) => {
  const eventId = parseInt(req.params.id as string);
  const event = await queryOne(`SELECT id FROM awards_events WHERE id=?`, [eventId]);
  if (!event) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');
  if (!req.file) throw new AppError(400, 'BAD_REQUEST', 'Excel ファイルを添付してください');

  // mapping は body の `mapping` フィールド (JSON string) で受け取る。
  // 未指定なら従来通り auto-detect (= 既存の挙動を維持)。
  let mapping: ImportMapping | undefined;
  if (req.body?.mapping) {
    try {
      mapping = JSON.parse(req.body.mapping as string) as ImportMapping;
    } catch {
      throw new AppError(400, 'BAD_REQUEST', 'mapping は JSON 形式で送信してください');
    }
  }

  // v2.8.69+: extraColumns (= 既知 CG 項目に該当しないが「そのまま保存」する Excel ヘッダー一覧)
  let extraColumns: string[] | undefined;
  if (req.body?.extraColumns) {
    try {
      const parsed = JSON.parse(req.body.extraColumns as string);
      if (Array.isArray(parsed)) extraColumns = parsed.filter((s) => typeof s === 'string');
    } catch {
      throw new AppError(400, 'BAD_REQUEST', 'extraColumns は JSON 配列で送信してください');
    }
  }

  // v2.9.102+: dryRun=true なら DB へ書き込まず差分プラン (新規/更新/変更なし) のみ返す。
  const dryRun = req.body?.dryRun === 'true' || req.body?.dryRun === true;

  const result = await importAwardsExcel(req.file.buffer, eventId, mapping, extraColumns, dryRun);
  res.json({ success: true, data: result });
}));

// ── データを入れる: 貼る (20f) ───────────────────────────────
//
// 貼られた文字は**その場で xlsx にして上の取り込みに渡す**。
// 取り込みの処理を2本書くと「ファイルなら入るのに貼ると入らない」形の
// 食い違いが出て、現場では原因が分からない。
router.post('/events/:id/paste-preview', wrap(async (req, res) => {
  const eventId = parseInt(req.params.id as string);
  const event = await queryOne(`SELECT id FROM awards_events WHERE id=?`, [eventId]);
  if (!event) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');
  res.json({ success: true, data: previewPasted(String(req.body?.text ?? '')) });
}));

router.post('/events/:id/paste-import', wrap(async (req, res) => {
  const eventId = parseInt(req.params.id as string);
  const event = await queryOne(`SELECT id FROM awards_events WHERE id=?`, [eventId]);
  if (!event) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

  const mapping = (req.body?.mapping ?? undefined) as ImportMapping | undefined;
  const extraColumns = Array.isArray(req.body?.extraColumns)
    ? (req.body.extraColumns as unknown[]).filter((s): s is string => typeof s === 'string')
    : undefined;
  const dryRun = req.body?.dryRun === true || req.body?.dryRun === 'true';

  const result = await importPasted(
    eventId, String(req.body?.text ?? ''), mapping, extraColumns, dryRun);

  // 本番の取り込みだけ AI の差分と成果を記録する (下見では記録しない)
  if (!dryRun) {
    const rows = (result.changes ?? []).map((c) => ({
      row_key: `${c.category}::${c.name}`, category: c.category, name: c.name, org: '',
    }));
    await recordIntakeCorrections(eventId, rows, req.user?.id ?? 'unknown');
    await recordIntakeOutcome(eventId, result);
  }
  res.json({ success: true, data: result });
}));

// ── データを入れる: AIに整えさせる (20f) ─────────────────────
//
// AI がやるのは**表の形に直すところまで**。取り込むかどうかは人が決める。
router.post('/events/:id/tidy', requireAuth, requirePermission('awards'), wrap(async (req, res) => {
  const eventId = parseInt(req.params.id as string);
  res.json({
    success: true,
    data: await tidyWithAi(eventId, String(req.body?.text ?? ''),
      { userId: req.user?.id ?? 'unknown' }),
  });
}));

// 整えた表を使わなかった (使われなかったことも成果として残す)
router.post('/events/:id/tidy/dropped', requireAuth, requirePermission('awards'), wrap(async (req, res) => {
  await recordIntakeDropped(parseInt(req.params.id as string), req.body?.note);
  res.json({ success: true });
}));

// ── 画像フォルダ一括インポート ──────────────────────────────
// マッチングは「画像ID 完全一致 → 画像ID 正規化一致 → 氏名/プロジェクト名 一致」の順に試行。
// ・フォルダアップロード (webkitdirectory) で path 付きファイル名が来ても basename を使用
// ・隠しファイル (._*, .DS_Store, Thumbs.db) と __MACOSX 配下は無視
// ・画像IDの leading zero / 全角半角 / 大文字小文字 / 空白 / Unicode NFC-NFD 差異を吸収
// ・multer が latin1 で originalname をデコードした場合の文字化けも復号して試行
router.post(
  '/events/:id/import-images',
  requireAuth, requirePermission('awards'),
  upload.array('images', 500),
  wrap(async (req, res) => {
    const eventId = parseInt(req.params.id as string);
    const event = await queryOne(`SELECT id, name FROM awards_events WHERE id=?`, [eventId]) as
      | { id: number; name: string }
      | null;
    if (!event) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) throw new AppError(400, 'BAD_REQUEST', '画像ファイルを添付してください');

    // 1) エントリ一覧を取得して照合用インデックスを作成
    const entries = await queryAll(
      `SELECT id, image_id, name, name_en FROM awards_entries WHERE event_id=?`,
      [eventId]
    ) as { id: number; image_id: string | null; name: string; name_en: string | null }[];

    // 全角→半角、画像拡張子除去、空白/区切り除去、小文字化、Unicode NFC、leading zero 削除（数字のみ）
    // DB 側 image_id が `ai_3_1.jpg` のようにフルファイル名で保存されているケースに対応するため
    // 末尾の画像拡張子 (.jpg/.jpeg/.png/.webp/.gif) を先に除去する。
    const norm = (raw: string | null | undefined): string => {
      if (!raw) return '';
      let s = String(raw).normalize('NFC').trim();
      s = s.replace(/\.(jpe?g|png|webp|gif)$/i, '');
      s = s
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(/[\s　_\-‐－]+/g, '')
        .toLowerCase();
      // 数字のみなら leading zero を除去（例: 001 == 1）
      if (/^\d+$/.test(s)) s = String(parseInt(s, 10));
      return s;
    };

    // multer が latin1 として originalname をデコードしている場合の復号
    // （新しい multer でも一部環境で UTF-8 が latin1 扱いになることがある）
    const fixMojibake = (s: string): string => {
      try {
        // latin1 として解釈し直して utf8 に再デコード
        const fixed = Buffer.from(s, 'latin1').toString('utf8');
        // 戻した結果に置換文字 (U+FFFD) が無く、かつ元と異なるならば採用
        if (!fixed.includes('�') && fixed !== s) return fixed;
      } catch { /* noop */ }
      return s;
    };

    const byImageId = new Map<string, number>(); // 画像ID 正規化 → entry.id
    const byName    = new Map<string, number>(); // 氏名 / 英語名 正規化 → entry.id
    const sampleImageIds: string[] = [];
    for (const e of entries) {
      if (e.image_id) {
        const k = norm(e.image_id);
        if (k && !byImageId.has(k)) {
          byImageId.set(k, e.id);
          if (sampleImageIds.length < 5) sampleImageIds.push(e.image_id);
        }
      }
      if (e.name) {
        const k = norm(e.name);
        if (k && !byName.has(k)) byName.set(k, e.id);
      }
      if (e.name_en) {
        const k = norm(e.name_en);
        if (k && !byName.has(k)) byName.set(k, e.id);
      }
    }

    let matched = 0;
    const unmatched: { name: string; tried: string }[] = [];
    const skipped: string[] = [];

    for (const file of files) {
      // webkitdirectory で送られた場合 originalname にパスが含まれることがあるので basename 化
      const rawName = path.basename(file.originalname);
      // 文字化け復号も試す
      const fixedName = fixMojibake(rawName);
      const baseName = fixedName !== rawName ? fixedName : rawName;

      // 隠しファイル・OS メタデータを除外
      if (
        baseName.startsWith('.') ||
        baseName.toLowerCase() === 'thumbs.db' ||
        file.originalname.includes('__MACOSX/')
      ) {
        skipped.push(baseName);
        continue;
      }

      const stem = baseName.replace(/\.[^.]+$/, ''); // 拡張子なし
      // 候補: 通常 / 文字化け復号 / 元のまま の 3 通りを試す
      const keys = [norm(stem), norm(rawName.replace(/\.[^.]+$/, '')), norm(fixedName.replace(/\.[^.]+$/, ''))]
        .filter((k, i, a) => k && a.indexOf(k) === i);

      const ext = detectExt(file.buffer);
      if (!ext) { unmatched.push({ name: baseName, tried: keys.join(' | ') }); continue; }

      // 画像ID → 名前 の順にマッチング
      let entryId: number | undefined;
      for (const k of keys) {
        entryId = byImageId.get(k) ?? byName.get(k);
        if (entryId) break;
      }
      if (!entryId) { unmatched.push({ name: baseName, tried: keys.join(' | ') }); continue; }

      const filename = `${crypto.randomUUID()}${ext}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, filename), file.buffer);
      const photoUrl = `/api/v1/internal/awards/images/${filename}`;

      await execute(
        `UPDATE awards_entries SET photo_url=?, photo_box_file_id=NULL, updated_at=NOW() WHERE id=?`,
        [photoUrl, entryId]
      );

      // BOX ミラー (fire-and-forget) — entryId をクロージャで捕捉
      const targetId = entryId;
      const targetBuf = file.buffer;
      uploadAwardsImageToBox(event.id, event.name, filename, targetBuf)
        .then((boxFileId) => {
          if (boxFileId) {
            execute(
              `UPDATE awards_entries SET photo_box_file_id=?, updated_at=NOW() WHERE id=?`,
              [boxFileId, targetId]
            ).catch((e) => console.warn('[awards-box] DB update failed:', (e as Error).message));
          }
        })
        .catch((e) => console.warn('[awards-box] mirror failed:', (e as Error).message));
      matched++;
    }

    res.json({
      success: true,
      data: {
        matched,
        unmatched: unmatched.map((u) => u.name),
        skipped,
        // 診断用: マッチに失敗した場合に DB 側の値と試行キーを確認できるように
        debug: {
          totalEntries: entries.length,
          entriesWithImageId: byImageId.size,
          sampleImageIds,                // DB に保存されている image_id の最初の 5 件
          unmatchedDetails: unmatched.slice(0, 10), // 最大 10 件、ファイル名と試行した正規化キー
        },
      },
    });
  })
);

// ── カテゴリ並び替え ────────────────────────────────────────
router.put('/events/:id/categories/reorder', wrap(async (req, res) => {
  const eventId = parseInt(req.params.id as string);
  const { order } = req.body as { order: { id: number; displayOrder: number }[] };
  if (!Array.isArray(order) || order.length === 0) {
    throw new AppError(400, 'BAD_REQUEST', 'order は配列が必要です');
  }

  const pool = getDb();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of order) {
      await client.query(
        `UPDATE awards_categories SET display_order=$1 WHERE id=$2 AND event_id=$3`,
        [item.displayOrder, item.id, eventId]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ── ダミーデータ挿入（Excel なしでテスト用）────────────────
router.post('/events/:id/seed-dummy', wrap(async (req, res) => {
  const eventId = parseInt(req.params.id as string);
  const event = await queryOne(`SELECT id FROM awards_events WHERE id=?`, [eventId]);
  if (!event) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

  const categoryName: string = (req.body.categoryName as string)?.trim() || 'ベストパフォーマンス賞';
  const entryCount = Math.min(parseInt(req.body.entryCount as string) || 5, 10);

  const pool = getDb();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const maxOrderRes = await client.query(
      `SELECT COALESCE(MAX(display_order),0) AS max FROM awards_categories WHERE event_id = $1`,
      [eventId]
    );
    const catRes = await client.query(
      `INSERT INTO awards_categories (event_id, name, display_order)
       VALUES ($1,$2,$3) RETURNING id`,
      [eventId, categoryName, (maxOrderRes.rows[0].max as number) + 1]
    );
    const categoryId: number = catRes.rows[0].id as number;

    const dummyNames = [
      ['山田 太郎', 'デジタル推進部'],
      ['鈴木 花子', 'マーケティング部'],
      ['田中 一郎', '営業第一部'],
      ['佐藤 美咲', 'エンジニアリング部'],
      ['高橋 健二', 'クリエイティブ部'],
      ['渡辺 由美', '商品開発部'],
      ['伊藤 賢', 'カスタマーサクセス部'],
      ['中村 真由子', 'ファイナンス部'],
      ['小林 裕樹', '人事部'],
      ['加藤 奈緒', '経営企画部'],
    ];
    const basePoints = [4800, 4200, 3600, 3100, 2700, 2300, 2000, 1800, 1500, 1200];

    for (let i = 0; i < entryCount; i++) {
      const rank = i + 1;
      const [name, org] = dummyNames[i % dummyNames.length];
      const points = basePoints[i] + Math.floor(Math.random() * 200) - 100;
      await client.query(
        `INSERT INTO awards_entries (event_id, category_id, rank, name, org, points, is_winner)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [eventId, categoryId, rank, name, org, points, rank === 1]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: { categoryId, entryCount } });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

export default router;
