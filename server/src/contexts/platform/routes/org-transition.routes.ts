/**
 * 旧⇄新の切替状態の API — 2026年10月の事業再編（§5）
 *
 * GET は認証さえあれば誰でも読める（移行センターに限らず、広く帯として出す
 * バナー表示の裏取りに使うことを見込んでいる）。状態・切替日の変更（PUT）は
 * `system_admin` だけ（切替は人の操作だけで行う・§8「Claude が自動で切り替える」対策）。
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireRole } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { getOrgTransition, updateOrgTransition } from '../services/org-transition.service';
import { listRenumberCandidates } from '../services/migration-center.service';

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const router = Router();
router.use(requireAuth);

router.get('/', wrap(async (_req, res) => {
  res.json({ success: true, data: await getOrgTransition() });
}));

/**
 * 改番の対象一覧（移行センター・§4.8）。件数は `data.length` で読む——
 * 一覧と進捗（残件数）・`done` への残件0ゲート・通知ジョブが全部この1本を使う
 * （同じ数字を2か所で数えない）。
 */
router.get('/renumber-candidates', wrap(async (_req, res) => {
  res.json({ success: true, data: await listRenumberCandidates() });
}));

router.put('/', requireRole('system_admin'), wrap(async (req, res) => {
  // ⚠️ **`done` への遷移だけ、ここで「残件0」を検査する。**
  // `org-transition.service.ts` 側に置くと `migration-center.service.ts` →
  // `entity-resolution.service.ts` → `org-transition.service.ts` の循環 import になる
  // （`entity-resolution.service.ts` 冒頭のコメントで実測済みの罠と同じ）ため、
  // ルート層（循環しない）にガードを置く。
  const current = await getOrgTransition();
  if (req.body?.state === 'done' && current.state !== 'done') {
    const remaining = await listRenumberCandidates();
    if (remaining.length > 0) {
      throw new AppError(
        400, 'RENUMBER_REMAINING',
        `改番が済んでいない案件が ${remaining.length} 件残っています。移行センターの対象一覧から先に改番してください`,
      );
    }
  }
  // それ以外の検証は org-transition.service.ts 側。投げた AppError はそのまま errorHandler へ流す
  // （ここで捕まえて書き直さない）。
  const updated = await updateOrgTransition(req.body ?? {}, req.user!.id);
  res.json({ success: true, data: updated });
}));

export default router;
