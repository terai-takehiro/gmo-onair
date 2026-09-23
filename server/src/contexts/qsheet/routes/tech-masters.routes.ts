/**
 * 技術資料のマスタ — パッチ盤（`/tech-panels`）・会社（`/tech-companies`。中身は取引先 `companies`）・
 * 技術人員（`/tech-persons`）。設計: docs/design/v4/tech-docs.md §5-4（権限）・§5-5（API）。
 *
 * 読むのは `qsheet` reader 以上（組織共通のマスタなので案件の可視性は見ない）。
 * **書き込みはすべて `'manager'`**（⑤パッチ盤・⑥技術人員の編集。§5-4）。
 *
 * ⚠️ `/tech-panels/devices` は **`/tech-panels/:id` より先に**定義する
 *    （後に書くと `devices` が `:id` として食われる）。
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { wrap, p1 } from './wrap';
import { NotFoundError } from '../services/httpErrors';
import {
  listPanels,
  getPanelDetail,
  listDeviceOptions,
  createPanel,
  updatePanel,
  updateJack,
  listCompanies,
  createCompany,
  listPersons,
  createPerson,
  updatePerson,
  deletePerson,
} from '../services/tech-master.service';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

const manager = requirePermission('qsheet', 'manager');

// ── パッチ盤 ─────────────────────────────────────────────

router.get('/tech-panels', wrap(async (_req, res) => {
  res.json({ success: true, data: await listPanels() });
}));

/** ⚠️ `/:id` より先（`devices` を id として食わせない） */
router.get('/tech-panels/devices', wrap(async (_req, res) => {
  res.json({ success: true, data: await listDeviceOptions() });
}));

router.get('/tech-panels/:id', wrap(async (req: Request, res: Response) => {
  const detail = await getPanelDetail(p1(req.params.id));
  if (!detail) throw new NotFoundError('パッチ盤が見つかりません');
  res.json({ success: true, data: detail });
}));

router.post('/tech-panels', manager, wrap(async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const row = await createPanel({
    name: typeof b.name === 'string' ? b.name : '',
    jack_count: Number(b.jack_count),
    kind: typeof b.kind === 'string' ? b.kind : 'jack',
    location: typeof b.location === 'string' ? b.location : '',
    model: typeof b.model === 'string' ? b.model : '',
  }, req.user!.id);
  res.status(201).json({ success: true, data: row });
}));

router.patch('/tech-panels/:id', manager, wrap(async (req: Request, res: Response) => {
  const row = await updatePanel(p1(req.params.id), req.user!.id, req.body as Record<string, unknown>);
  res.json({ success: true, data: row });
}));

/** 1ch の転記（§9-1。将来「外観図から転記する」を足すときも同じ口） */
router.patch('/tech-panels/:id/jacks/:jackId', manager, wrap(async (req: Request, res: Response) => {
  const row = await updateJack(p1(req.params.id), p1(req.params.jackId), req.user!.id, req.body as Record<string, unknown>);
  res.json({ success: true, data: row });
}));

// ── 会社（= 案件管理の取引先 `companies`。§13-5） ─────────────
// 読むのは qsheet reader（id・名前・短い名前・人数だけ）。足すのは manager で、
// 取引先に仕入先として登録する（同じ名前があればそれを返す）。
// ⚠️ 名前の変更・削除の口は持たない——取引先の編集は案件管理で行う。

router.get('/tech-companies', wrap(async (_req, res) => {
  res.json({ success: true, data: await listCompanies() });
}));

router.post('/tech-companies', manager, wrap(async (req: Request, res: Response) => {
  const row = await createCompany(req.body as Record<string, unknown>, req.user!.id);
  res.status(201).json({ success: true, data: row });
}));

// ── 技術人員 ─────────────────────────────────────────────

router.get('/tech-persons', wrap(async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const rows = await listPersons({
    company: q.company,
    q: q.q,
    role: q.role,
    include_inactive: q.include_inactive === '1' || q.include_inactive === 'true',
  });
  res.json({ success: true, data: rows });
}));

router.post('/tech-persons', manager, wrap(async (req: Request, res: Response) => {
  const row = await createPerson(req.body as Record<string, unknown>);
  res.status(201).json({ success: true, data: row });
}));

router.patch('/tech-persons/:id', manager, wrap(async (req: Request, res: Response) => {
  const row = await updatePerson(p1(req.params.id), req.body as Record<string, unknown>);
  res.json({ success: true, data: row });
}));

/** 論理削除（`deleted_at`）。資料の行に写した名前は残る（§5-2） */
router.delete('/tech-persons/:id', manager, wrap(async (req: Request, res: Response) => {
  await deletePerson(p1(req.params.id));
  res.json({ success: true, data: { id: p1(req.params.id) } });
}));

export default router;
