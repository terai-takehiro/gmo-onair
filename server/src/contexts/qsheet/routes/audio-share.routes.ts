import { Router, Request, Response } from 'express';
import { queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { isQsheetAdmin } from '../access';
import { ensureActiveShare, reissueShare, revokeActiveShare, type AudioShareRow } from '../services/audio-share.service';

const router = Router();

// 発行・再発行・失効は「共有設定を変更できる人」に限る。documents.routes.ts の
// PUT /documents/:id/shares (:287-296) と同じ判定 (作成者本人 or 管理者のみ。
// canAccessDoc の「共有された閲覧者」はここには含めない — 公開URLを誰でも
// 発行・失効できてしまうと、共有された側が誤って番組を止められる)。
// ⚠️ **パスを付けずに `router.use(...)` を書かないこと**（2026-08-22 に実際に踏んだ）。
// この router は `server/src/contexts/qsheet/index.ts` で **`/qsheet` に丸ごと**載せている。
// パスなしの `router.use` は `/qsheet/**` のすべてに当たるため、ここの `editor` 要求が
// **あとから載せた別の router 全部に効いてしまう**（収録設定・配信設定・スケジュール表・
// トップ…）。実測では `qsheet: reader` の人が制作技術支援の API を1本も叩けず、
// 画面は空のまま「このモジュールへのアクセス権限がありません」だけが出ていた。
router.use('/documents/:id/audio-share', requireAuth, requirePermission('qsheet', 'editor'));

async function loadOwnedDoc(req: Request, res: Response): Promise<{ id: string; created_by: string | null } | null> {
  const doc = (await queryOne(
    'SELECT id, created_by FROM qsheet_documents WHERE id = $1 AND deleted_at IS NULL',
    [req.params.id],
  )) as { id: string; created_by: string | null } | undefined;
  if (!doc) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ドキュメントが見つかりません' } });
    return null;
  }
  if (!isQsheetAdmin(req.user!) && doc.created_by !== req.user!.id) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '共有URLを操作する権限がありません' } });
    return null;
  }
  return doc;
}

async function creatorName(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const u = (await queryOne('SELECT name FROM users WHERE id = $1', [userId])) as { name: string } | undefined;
  return u?.name ?? null;
}

async function toPayload(row: AudioShareRow) {
  return {
    token: row.token,
    created_by: row.created_by,
    created_by_name: await creatorName(row.created_by),
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
  };
}

// ============================================================
// 現在有効な共有URLトークンを返す。無ければその場で1本発行する
// (studio.routes.ts の getOrCreateFeedToken() と同じ形。共有ダイアログを
//  開いた瞬間に QR を出すため「発行ボタンを押させてから」にはしない)。
// ============================================================
router.get('/documents/:id/audio-share', async (req: Request, res: Response) => {
  try {
    const doc = await loadOwnedDoc(req, res);
    if (!doc) return;
    const share = await ensureActiveShare(doc.id, req.user!.id);
    res.json({ success: true, data: await toPayload(share) });
  } catch (err: unknown) {
    console.error('GET /documents/:id/audio-share error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

// ============================================================
// 「新しいURLにする」＝直前の有効なトークンを失効させてから新規発行。
// 押した瞬間に古いQRはその場で死ぬ (410)。
// ============================================================
router.post('/documents/:id/audio-share/reissue', async (req: Request, res: Response) => {
  try {
    const doc = await loadOwnedDoc(req, res);
    if (!doc) return;
    const share = await reissueShare(doc.id, req.user!.id);
    res.json({ success: true, data: await toPayload(share) });
  } catch (err: unknown) {
    console.error('POST /documents/:id/audio-share/reissue error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

// ============================================================
// 「このURLを失効させる」＝有効なトークンを失効させるだけ (再発行しない)。
// 取り消せない操作 — クライアント側で確認ダイアログを出す。
// ============================================================
router.post('/documents/:id/audio-share/revoke', async (req: Request, res: Response) => {
  try {
    const doc = await loadOwnedDoc(req, res);
    if (!doc) return;
    await revokeActiveShare(doc.id, req.user!.id);
    res.json({ success: true });
  } catch (err: unknown) {
    console.error('POST /documents/:id/audio-share/revoke error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

export default router;
