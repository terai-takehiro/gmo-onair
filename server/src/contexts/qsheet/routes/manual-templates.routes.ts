/**
 * 運営マニュアル 段E — ひな形（`qsheet_manual_templates`。scope="org" だけ）。
 * production-manual.md §5-4「GET/POST /manual-templates | 読み reader・書き manager」・
 * 段Eの設計判断3。「前の案件の前の冊子から」複製する経路はここを経由しない別物
 * （`POST /manuals` の `copy_from_manual_id`。`manuals.routes.ts`）。
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { canAccessManual } from '../access';
import { wrap } from './wrap';
import { NotFoundError, ValidationError } from '../services/httpErrors';
import { getManualRaw } from '../services/manual.service';
import { listOrgTemplates, createTemplateFromManual } from '../services/manual-template.service';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

router.get('/manual-templates', wrap(async (_req: Request, res: Response) => {
  res.json({ success: true, data: await listOrgTemplates() });
}));

/**
 * 組織共通ひな形として登録できるのは manager だが、**元の冊子は本人が見えるものに限る**
 * （`canAccessManual`）。ここを外すと、他案件の非公開な冊子を manager 権限だけで
 * 組織全員（reader）に公開できてしまう——組織共通ひな形は誰でも読めるのが前提のため
 * （`manual-lock.routes.ts` の `requirePermission` + `requireAccessible` と同じ二段構え）。
 */
router.post('/manual-templates', requirePermission('qsheet', 'manager'), wrap(async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const sourceManualId = typeof b.source_manual_id === 'string' ? b.source_manual_id : '';
  if (!sourceManualId) throw new ValidationError('source_manual_id を指定してください');

  const raw = await getManualRaw(sourceManualId);
  if (!raw) throw new NotFoundError('複製元の冊子が見つかりません');
  if (!(await canAccessManual(req.user!, raw.id as string, (raw.created_by as string) ?? null))) {
    throw new NotFoundError('複製元の冊子が見つかりません'); // 存在秘匿
  }

  const row = await createTemplateFromManual(
    typeof b.name === 'string' ? b.name : '',
    sourceManualId,
    req.user!.id,
  );
  res.status(201).json({ success: true, data: row });
}));

export default router;
