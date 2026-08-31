import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { fetchProject, PART_KEYS, PartKey, SLOTS, Slot } from '../store';
import { commitRosterImport, previewRosterExcel, RosterFieldCandidate } from '../services/roster-import.service';

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

  // 部品の PART_FIELDS（key/label）はクライアント側にしか無いので、推奨マッピングを
  // 計算したいときは呼び出し元がここへ候補を渡す（部品未選択 or 未指定なら型判定だけ返す）。
  let fieldCandidates: RosterFieldCandidate[] = [];
  const rawCandidates = req.body?.fieldCandidates;
  if (typeof rawCandidates === 'string' && rawCandidates.trim() !== '') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawCandidates);
    } catch {
      throw new AppError(400, 'BAD_REQUEST', 'fieldCandidates は JSON 形式で送信してください');
    }
    if (!Array.isArray(parsed)) throw new AppError(400, 'VALIDATION_ERROR', 'fieldCandidates は配列です');
    fieldCandidates = parsed.slice(0, 50).filter((c): c is RosterFieldCandidate =>
      !!c && typeof c === 'object'
      && typeof (c as Record<string, unknown>).key === 'string'
      && typeof (c as Record<string, unknown>).label === 'string'
    );
  }

  const result = await previewRosterExcel(req.file.buffer, fieldCandidates);
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

  // 省略時は従来どおり即時投入。「まず確認してから投入する」の2段UIは
  // クライアント側が dryRun:true → false の順で2回呼ぶことで実現する。
  const dryRun = req.body?.dryRun === 'true' || req.body?.dryRun === true;

  const result = await commitRosterImport({
    projectId,
    buffer: req.file.buffer,
    slot: slot as Slot,
    partKey: partKey as PartKey,
    mapping,
    nameColumn,
    dryRun,
  });
  res.json({ success: true, data: result });
}));

export default router;
