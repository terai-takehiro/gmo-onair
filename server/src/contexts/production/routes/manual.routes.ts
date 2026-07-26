/**
 * 運営マニュアル (デザイン 22章 29a/29b/29c) の HTTP 口
 *
 * 案件の書類なので `sales` 権限。読みは reader、直すのは editor。
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import {
  ensureManual, getManual, savePart, getLayout, putLayoutItem, deleteLayoutItem,
  draftLayoutWithAi, saveLayoutCorrections, issueManual, getIssue, markLayoutDropped,
  MANUAL_PARTS, AUDIENCES, OUT_RULES, SCENES, SCENE_LABELS, SYMBOLS,
  type Audience,
} from '../services/manual.service';

const router = Router();
router.use(requireAuth, requirePermission('sales'));

const uid = (req: any) => String(req.user?.id ?? '');
const audienceOf = (v: unknown): Audience =>
  (AUDIENCES.some((a) => a.key === v) ? v : 'internal') as Audience;

// 部品12種と渡す相手の定義 (案件に依らない)。29a を画面に出すのに使う
router.get('/format', async (_req, res) => {
  res.json({
    success: true,
    data: {
      parts: MANUAL_PARTS, audiences: AUDIENCES, out_rules: OUT_RULES,
      scenes: SCENES.map((s) => ({ key: s, label: SCENE_LABELS[s] })), symbols: SYMBOLS,
    },
  });
});

// 案件の1冊を開く (無ければ作って部品12種の枠をそろえる)
router.post('/projects/:projectId', requirePermission('sales', 'editor'), async (req, res) => {
  const m = await ensureManual(String(req.params.projectId), uid(req));
  res.status(201).json({ success: true, data: await getManual(String(m.id)) });
});

router.get('/projects/:projectId', async (req, res) => {
  const m = await ensureManual(String(req.params.projectId), uid(req));
  res.json({ success: true, data: await getManual(String(m.id), audienceOf(req.query.audience)) });
});

router.get('/:id', async (req, res) => {
  res.json({ success: true, data: await getManual(String(req.params.id), audienceOf(req.query.audience)) });
});

// 部品の中身を入れる
router.put('/:id/parts/:kind', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({
    success: true,
    data: await savePart(String(req.params.id), String(req.params.kind), req.body ?? {}, uid(req)),
  });
});

// 配置図 (場面ごとに1枚)
router.get('/:id/layouts/:scene', async (req, res) => {
  res.json({ success: true, data: await getLayout(String(req.params.id), String(req.params.scene)) });
});

router.put('/:id/layouts/:layoutId/items', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({ success: true, data: await putLayoutItem(String(req.params.layoutId), req.body ?? {}) });
});

router.delete('/:id/layouts/:layoutId/items/:itemId', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({
    success: true,
    data: await deleteLayoutItem(String(req.params.layoutId), String(req.params.itemId)),
  });
});

// AI が会場図を下書きする (人が実測と動線を直す前提)
router.post('/:id/layouts/:scene/ai-draft', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({
    success: true,
    data: await draftLayoutWithAi(String(req.params.id), String(req.params.scene), { userId: uid(req) }),
  });
});

// 人が直した分を AI の下書きとの差分として記録する (方針の条件2)
router.post('/:id/layouts/:scene/corrections', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({
    success: true,
    data: await saveLayoutCorrections(String(req.params.id), String(req.params.scene), uid(req)),
  });
});

// AI の下書きを使わなかったことを記録する (条件3の裏側)
router.post('/:id/layouts/:scene/dropped', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({
    success: true,
    data: await markLayoutDropped(String(req.params.id), String(req.params.scene), req.body?.note),
  });
});

// 出す (出した瞬間の中身を残す)
router.post('/:id/issue', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({
    success: true,
    data: await issueManual(String(req.params.id), audienceOf(req.body?.audience), uid(req)),
  });
});

router.get('/issues/:issueId', async (req, res) => {
  res.json({ success: true, data: await getIssue(String(req.params.issueId)) });
});

export default router;
