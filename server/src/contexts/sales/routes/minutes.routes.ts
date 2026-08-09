/**
 * 案件の議事録 (v4 ⑥ やり取りタブ)
 *
 *   GET    /projects/:projectId/minutes        一覧 (文字起こし全文は返さない)
 *   GET    /projects/:projectId/minutes/:id    1件 (全文つき)
 *   POST   /projects/:projectId/minutes        音声を投げる → 裏で文字起こし
 *   PUT    /projects/:projectId/minutes/:id    直す / 確定する
 *   DELETE /projects/:projectId/minutes/:id
 *
 * **音声はディスクに置きません** (`multer.memoryStorage`)。文字起こしが済んだら
 * その場で捨てます — 取引先の声が入るものを、消し忘れの起きる場所に置かない。
 */
import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  listMinutes, getMinutes, startTranscription, updateMinutes, deleteMinutes, openItemToTask,
} from '../services/minutes.service';
import { MAX_AUDIO_BYTES, isSttConfigured, normalizeAudioName } from '../services/minutes-ai.service';

// `mergeParams` で親の `:projectId` を受け取る。型は既定が `{}` なので、
// 既存の `estimates.routes.ts` と同じく取り出すときに書く
const router = Router({ mergeParams: true });
const paramsOf = (req: { params: unknown }) => req.params as Record<string, string>;
router.use(requireAuth, requirePermission('sales'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
});

const canEdit = requirePermission('sales', 'editor');

router.get('/', async (req, res) => {
  const rows = await listMinutes(paramsOf(req).projectId);
  // 文字起こしができる設定かどうかを画面に渡す。**押してから「使えません」は最悪**
  res.json({ success: true, data: rows, stt_available: isSttConfigured() });
});

router.get('/:id', async (req, res) => {
  res.json({ success: true, data: await getMinutes(paramsOf(req).id) });
});

router.post('/', canEdit, upload.single('audio'), async (req, res) => {
  if (!isSttConfigured()) {
    // 400 で理由を返す。500 だと「壊れた」と読まれるが、これは**設定の話**
    throw new AppError(400, 'NOT_CONFIGURED',
      'この環境は文字起こしにつないでいません（OPENAI_API_KEY 未設定）。管理者にご連絡ください');
  }
  const file = req.file;
  if (!file) throw new AppError(400, 'VALIDATION_ERROR', '音声が添付されていません');

  const metOn = typeof req.body?.met_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.met_on)
    ? req.body.met_on : null;

  const row = await startTranscription(
    paramsOf(req).projectId,
    file.buffer,
    // multer は multipart のファイル名を latin1 で読む（日本語が化ける）。
    // あわせて、**中身と拡張子が食い違っていたら直す** —
    // Safari は mp4 を返すのに画面が `.webm` で送っており、Whisper に断られていた
    normalizeAudioName(
      Buffer.from(file.originalname || 'recording.webm', 'latin1').toString('utf8'),
      file.mimetype,
    ),
    metOn,
    req.user!.id,
  );
  res.status(202).json({ success: true, data: row });
});

router.put('/:id', canEdit, async (req, res) => {
  res.json({ success: true, data: await updateMinutes(paramsOf(req).id, req.body ?? {}, req.user!.id) });
});

/**
 * 持ち帰り（未確認事項）をタスクにする。
 *
 * **二度作れない** — 作ると `open_items` のその要素に印が付く。
 * 画面のボタンを隠すだけだと、同時に開いた別の画面は古いままボタンを出す。
 */
router.post('/:id/open-items/:index/task', canEdit, async (req, res) => {
  const index = Number(paramsOf(req).index);
  if (!Number.isInteger(index) || index < 0) {
    throw new AppError(400, 'VALIDATION_ERROR', '持ち帰りの位置が正しくありません');
  }
  res.status(201).json({
    success: true,
    data: await openItemToTask(paramsOf(req).id, index, req.user!.id),
  });
});

router.delete('/:id', requirePermission('sales', 'manager'), async (req, res) => {
  await deleteMinutes(paramsOf(req).id, req.user!.id);
  res.json({ success: true, message: '削除しました' });
});

export default router;
