/**
 * 見積・請求の「原本」(PDF / 画像)
 *
 * **承認画面で原本を読めるようにするための口**。実体は Box に置き、DB は ID だけ持つ
 * (サーバーのディスクに置くと再デプロイで消える = v2.9.50 で実際に踏んだ形)。
 *
 * フォルダ ID は運用者に調べさせない。社内限りの親フォルダの下に
 * `00_受信した請求書` が無ければサーバーが作る (`ensureReceivedDocsFolder`)。
 */
import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  isBoxConfigured, ensureReceivedDocsFolder, uploadToBox, downloadFromBox, fetchBoxExtractedText,
} from '../../../shared/services/box';
import { parseFinanceDocText } from '../services/finance-doc-parse.service';
import { financeDocService } from '../services/inbox.service';

const router = Router();
const canRead = [requireAuth, requirePermission('dailyops', 'reader')] as const;
const canEdit = [requireAuth, requirePermission('dailyops', 'editor')] as const;

// 請求書は写真で回ってくることがあるので画像も通す。20MB まで
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

type Kind = 'pdf' | 'image';

/**
 * 中身を見て形式を決める (拡張子や Content-Type は名乗りなので信じない)。
 * PDF: %PDF / JPEG: FF D8 FF / PNG: 89 50 4E 47
 */
function detectKind(buf: Buffer): Kind | null {
  if (buf.length < 8) return null;
  if (buf.subarray(0, 4).toString('latin1') === '%PDF') return 'pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image';
  return null;
}

/** multipart のファイル名は latin1 で来るので UTF-8 に戻す */
function safeName(original: string | undefined, kind: Kind): string {
  const raw = original ? Buffer.from(original, 'latin1').toString('utf8') : '';
  const cleaned = raw.replace(/[/\\?%*:|"<>]/g, '_').trim();
  if (cleaned) return cleaned;
  return `原本_${new Date().toISOString().slice(0, 10)}.${kind === 'pdf' ? 'pdf' : 'jpg'}`;
}

function requireBox(): void {
  if (!isBoxConfigured()) {
    throw new AppError(503, 'BOX_NOT_CONFIGURED', 'Box が未設定のため原本を保存できません (BOX_CONFIG_JSON が必要)');
  }
}

/** 原本を付ける / 差し替える */
router.post('/finance-docs/:id/original', ...canEdit, upload.single('file'), async (req, res) => {
  requireBox();
  const file = req.file;
  if (!file) throw new AppError(400, 'VALIDATION_ERROR', 'ファイルが選ばれていません');
  const kind = detectKind(file.buffer);
  if (!kind) throw new AppError(400, 'VALIDATION_ERROR', 'PDF か 画像 (JPEG / PNG) を選んでください');

  const row = await queryOne(
    `SELECT id, subject FROM finance_docs WHERE id = ? AND deleted_at IS NULL`, [String(req.params.id)],
  ) as { id: string; subject: string | null } | null;
  if (!row) throw new AppError(404, 'NOT_FOUND', '見積・請求が見つかりません');

  const folderId = await ensureReceivedDocsFolder();
  const name = safeName(file.originalname, kind);
  const uploaded = await uploadToBox(folderId, name, file.buffer);
  // **前の原本は Box から消さない** (差し替えの記録が要る書類なので黙って消さない)
  await execute(
    `UPDATE finance_docs SET box_file_id = ?, original_name = ?, original_kind = ?, original_size = ?,
            original_uploaded_at = NOW(), original_uploaded_by = ?, updated_at = NOW()
     WHERE id = ?`,
    [uploaded.id, uploaded.name, kind, file.size, req.user!.id, String(req.params.id)],
  );
  res.json({ success: true, data: await financeDocService.getById(String(req.params.id)) });
});

/** 原本を外す (付け間違いの取り消し)。Box のファイルは残す */
router.delete('/finance-docs/:id/original', ...canEdit, async (req, res) => {
  const row = await queryOne(`SELECT id FROM finance_docs WHERE id = ? AND deleted_at IS NULL`, [String(req.params.id)]);
  if (!row) throw new AppError(404, 'NOT_FOUND', '見積・請求が見つかりません');
  await execute(
    `UPDATE finance_docs SET box_file_id = NULL, original_name = NULL, original_kind = NULL,
            original_size = NULL, original_uploaded_at = NULL, original_uploaded_by = NULL, updated_at = NOW()
     WHERE id = ?`,
    [String(req.params.id)],
  );
  res.json({ success: true, data: await financeDocService.getById(String(req.params.id)) });
});

/**
 * 原本をそのまま返す (画面内に表示するため)。
 * 認証つきなので URL を知っただけでは開けない。ダウンロードさせたいときは `?download=1`。
 */
router.get('/finance-docs/:id/original', ...canRead, async (req, res) => {
  const row = await queryOne(
    `SELECT box_file_id, original_name, original_kind FROM finance_docs WHERE id = ? AND deleted_at IS NULL`,
    [String(req.params.id)],
  ) as { box_file_id: string | null; original_name: string | null; original_kind: string | null } | null;
  if (!row) throw new AppError(404, 'NOT_FOUND', '見積・請求が見つかりません');
  if (!row.box_file_id) throw new AppError(404, 'NO_ORIGINAL', 'この書類には原本が付いていません');
  requireBox();

  const buf = await downloadFromBox(row.box_file_id);
  const name = row.original_name ?? 'original';
  const type = row.original_kind === 'pdf'
    ? 'application/pdf'
    : /\.png$/i.test(name) ? 'image/png' : 'image/jpeg';
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader(
    'Content-Disposition',
    `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`,
  );
  res.send(buf);
});

/**
 * PDF を落として**新しい行を作る** (メールが無い請求書 — Slack で渡された / 紙を撮った)。
 *
 * 下読みした値はフォームに埋めるだけで、**status は new** のまま。
 * 読めなかった項目は空で返し、warnings を画面に出す (読めないことをエラーにしない)。
 */
router.post('/finance-docs/upload', ...canEdit, upload.single('file'), async (req, res) => {
  requireBox();
  const file = req.file;
  if (!file) throw new AppError(400, 'VALIDATION_ERROR', 'ファイルが選ばれていません');
  const kind = detectKind(file.buffer);
  if (!kind) throw new AppError(400, 'VALIDATION_ERROR', 'PDF か 画像 (JPEG / PNG) を選んでください');

  const folderId = await ensureReceivedDocsFolder();
  const name = safeName(file.originalname, kind);
  const uploaded = await uploadToBox(folderId, name, file.buffer);

  // 下読み。PDF だけ (画像は Box のテキスト抽出が当てにならないので試さない)
  const warnings: string[] = [];
  let parsed = null as ReturnType<typeof parseFinanceDocText> | null;
  if (kind === 'pdf') {
    const text = await fetchBoxExtractedText(uploaded.id);
    if (text) parsed = parseFinanceDocText(text, name);
    else warnings.push('Box のテキスト抽出が準備中のため下読みできませんでした。原本は付いています。内容を手で入れてください。');
  } else {
    warnings.push('画像は文字を読み取れないので、内容を手で入れてください。原本は付いています。');
  }

  const id = uuidv4();
  await execute(
    `INSERT INTO finance_docs
       (id, doc_type, sender, subject, amount, closing_month, payment_due, gls_number,
        status, received_at, source, created_by,
        box_file_id, original_name, original_kind, original_size, original_uploaded_at, original_uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, 'manual', ?, ?, ?, ?, ?, NOW(), ?)`,
    [
      id, parsed?.doc_type ?? 'invoice', parsed?.sender ?? null, parsed?.subject ?? name,
      parsed?.amount ?? null, parsed?.closing_month ?? null, parsed?.payment_due ?? null,
      parsed?.gls_number ?? null, new Date().toISOString().slice(0, 10), req.user!.id,
      uploaded.id, uploaded.name, kind, file.size, req.user!.id,
    ],
  );
  res.status(201).json({
    success: true,
    data: {
      row: await financeDocService.getById(id),
      warnings: [...(parsed?.warnings ?? []), ...warnings],
      parsed_by: parsed ? 'text' : 'none',
    },
  });
});

export default router;
