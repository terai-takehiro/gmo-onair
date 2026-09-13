/**
 * 運営マニュアル — 一覧・詳細・CRUD。段A（production-manual.md §5〜§6）。
 * 実装パターンは schedules.routes.ts をそのまま踏襲する。
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { canAccessManual, canAssignManualProject } from '../access';
import { wrap, p1 } from './wrap';
import { NotFoundError } from '../services/httpErrors';
import {
  listManuals, createManual, getManualRaw, getManualWithMeta, getManualPages, updateManual, deleteManual,
} from '../services/manual.service';
import { getManualOrgSeed } from '../services/manual-org-seed.service';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

async function requireAccessible(req: Request) {
  const raw = await getManualRaw(p1(req.params.id));
  if (!raw) throw new NotFoundError('マニュアルが見つかりません');
  const ok = await canAccessManual(req.user!, raw.id as string, (raw.created_by as string) ?? null);
  if (!ok) throw new NotFoundError('マニュアルが見つかりません'); // 存在秘匿
  return raw;
}

router.get('/manuals', wrap(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const rows = await listManuals(req.user!, {
    project_id: q.project_id, program_id: q.program_id, status: q.status, search: q.search,
  });
  res.json({ success: true, data: rows });
}));

router.post('/manuals', requirePermission('qsheet', 'editor'), wrap(async (req, res) => {
  const b = req.body as Record<string, unknown>;
  const projectId = typeof b.project_id === 'string' ? b.project_id : null;
  const programId = typeof b.program_id === 'string' ? b.program_id : null;
  // ⚠️ レビュー指摘（P1）: project_id を無検査で受けると、指定した本人が created_by になり
  // canAccessManual をそのまま通ってしまう——他案件になりすまして作成すれば resolve
  // （差し込み・段C）経由でその案件の配信の鍵・収録設定・レンタル機材等まで読めてしまう。
  // 存在秘匿のため 404（`requireAccessible` と同じ作法）。
  if (projectId && !(await canAssignManualProject(req.user!, projectId))) {
    throw new NotFoundError('案件が見つかりません');
  }
  const row = await createManual({
    title: typeof b.title === 'string' ? b.title : '',
    projectId,
    programId,
    serviceDate: typeof b.service_date === 'string' ? b.service_date : null,
    createdBy: req.user!.id,
    user: req.user!,
    // テンプレート／前回のマニュアルからの複製（段E）。どちらも省略可（今までどおり空ページ1枚）
    templateId: typeof b.template_id === 'string' ? b.template_id : null,
    copyFromManualId: typeof b.copy_from_manual_id === 'string' ? b.copy_from_manual_id : null,
  });
  res.status(201).json({ success: true, data: row });
}));

router.get('/manuals/:id', wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const manual = await getManualWithMeta(p1(req.params.id));
  if (!manual) throw new NotFoundError('マニュアルが見つかりません');
  const pages = await getManualPages(p1(req.params.id));
  res.json({ success: true, data: { ...manual, pages } });
}));

router.patch('/manuals/:id', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const b = req.body as Record<string, unknown>;
  const row = await updateManual(p1(req.params.id), req.user!.id, {
    ...(typeof b.title === 'string' ? { title: b.title } : {}),
    // service_date は明示的に null を渡して消せる（未指定=変更なし・null=クリア）
    ...('service_date' in b ? { serviceDate: typeof b.service_date === 'string' ? b.service_date : null } : {}),
    expectedUpdatedAt: b.expected_updated_at,
  });
  res.json({ success: true, data: row });
}));

/**
 * 体制図ブロック（自由ブロック）の「取り込み」元（production-manual-orgchart.md §5-5）。
 * 読むだけなので reader のまま（router 全体の `requirePermission('qsheet')` の既定）。
 * 行単位のゲートは `requireAccessible`（= `canAccessManual`・存在秘匿の 404）だけで、
 * 案件側の権限は改めて見ない（`manual-resolvers/` の共通ポリシーと同じ設計判断）。
 *
 * ⚠️ 案件 id は**クエリ・ボディから受け取らない**。マニュアル自身の `project_id` だけを読む
 * （受け取ると `POST /manuals` のレビュー指摘（P1）と同型の穴になる）。
 * `program_id` のマニュアル（project_id が null）は両方とも空で返す＝画面は取り込みボタンを出さない。
 */
router.get('/manuals/:id/org-seed', wrap(async (req: Request, res: Response) => {
  const raw = await requireAccessible(req);
  const data = await getManualOrgSeed((raw.project_id as string | null) ?? null);
  res.json({ success: true, data });
}));

router.delete('/manuals/:id', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  await deleteManual(p1(req.params.id), req.user!.id);
  res.json({ success: true, data: { id: p1(req.params.id) } });
}));

export default router;
