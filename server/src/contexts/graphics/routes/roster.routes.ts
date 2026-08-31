import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { fetchProject, PART_KEYS, PartKey, SLOTS, Slot } from '../store';
import { commitRosterImport, previewRosterExcel } from '../services/roster-import.service';

// 名簿（Excel）からのページ一括生成。§6「大量ページの一括生成はテンプレート×名簿から作る」。
// awards の import-preview/import-excel と同じ2段構え（preview → commit）だが、
// diff は無く常に新規ページを複数件作るだけ（シンプル版）。

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

async function requireProject(idParam: string) {
  const projectId = parseInt(idParam);
  const project = projectId && !isNaN(projectId) ? await fetchProject(projectId) : null;
  if (!project) throw new AppError(404, 'NOT_FOUND', 'CGプロジェクトが見つかりません');
  return projectId;
}

router.post('/projects/:id/roster/preview', upload.single('file'), wrap(async (req, res) => {
  await requireProject(req.params.id as string);
  if (!req.file) throw new AppError(400, 'BAD_REQUEST', 'Excel ファイルを添付してください');

  const result = await previewRosterExcel(req.file.buffer);
  res.json({ success: true, data: result });
}));

router.post('/projects/:id/roster/commit', upload.single('file'), wrap(async (req, res) => {
  const projectId = await requireProject(req.params.id as string);
  if (!req.file) throw new AppError(400, 'BAD_REQUEST', 'Excel ファイルを添付してください');

  const slot = req.body?.slot as string;
  if (!SLOTS.includes(slot as Slot)) {
    throw new AppError(400, 'VALIDATION_ERROR', `slot は ${SLOTS.join(' / ')} のいずれかです`);
  }
  const partKey = req.body?.partKey as string;
  if (!PART_KEYS.includes(partKey as PartKey)) {
    throw new AppError(400, 'VALIDATION_ERROR', `partKey は ${PART_KEYS.join(' / ')} のいずれかです`);
  }

  let mapping: Record<string, string>;
  try {
    mapping = JSON.parse(String(req.body?.mapping ?? '{}'));
  } catch {
    throw new AppError(400, 'BAD_REQUEST', 'mapping は JSON 形式で送信してください');
  }
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'mapping はオブジェクトです');
  }

  const nameColumnRaw = req.body?.nameColumn;
  const nameColumn = typeof nameColumnRaw === 'string' && nameColumnRaw.trim() !== ''
    ? nameColumnRaw.trim()
    : undefined;

  const result = await commitRosterImport({
    projectId,
    buffer: req.file.buffer,
    slot: slot as Slot,
    partKey: partKey as PartKey,
    mapping,
    nameColumn,
  });
  res.json({ success: true, data: result });
}));

export default router;
