import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { keepReportService } from '../services/keep-report.service';
import {
  addKpt, updateKpt, confirmKpt, deleteKpt, generateKptDraft, isKptKind,
} from '../services/kpt.service';

// 隔週キープ資料 (報告資料) の基礎データ編集 API。
// UI (案件管理アプリ /sales/keep-report) 用 — MCP ツールと同じ keepReportService を通る。

const router = Router();
router.use(requireAuth, requirePermission('sales'));

const YM_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ============ イベント実施報告 ============

// 一覧 (レポート + 未作成の報告候補)
router.get('/event-reports', async (req, res) => {
  const status = ['confirmed', 'draft', 'all'].includes(req.query.status as string)
    ? req.query.status as 'confirmed' | 'draft' | 'all' : 'all';
  const [reports, candidates] = await Promise.all([
    keepReportService.listEventReports({
      status,
      reportedFrom: req.query.reported_from as string | undefined,
      reportedTo: req.query.reported_to as string | undefined,
    }),
    keepReportService.listEventReportCandidates(90),
  ]);
  res.json({ success: true, data: { reports, candidates } });
});

router.get('/event-reports/:projectId', async (req, res) => {
  res.json({ success: true, data: await keepReportService.getEventReportWithProject(req.params.projectId as string) });
});

router.put('/event-reports/:projectId', requirePermission('sales', 'editor'), async (req, res) => {
  const { headline, attendees_onsite, attendees_online, attendees_note, report_status, reported_at } = req.body;
  if (report_status !== undefined && !['draft', 'confirmed'].includes(report_status)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'report_status は draft / confirmed');
  }
  if (reported_at !== undefined && reported_at !== null && reported_at !== '' && !DATE_RE.test(reported_at)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'reported_at は YYYY-MM-DD');
  }
  const result = await keepReportService.upsertEventReport(req.params.projectId as string, {
    headline, attendees_onsite, attendees_online, attendees_note, report_status,
    reported_at: reported_at === '' ? undefined : reported_at,
  });
  res.json({ success: true, data: result });
});

/*
 * ふりかえりの KPT (migration 185)。
 *
 * **書いた人は押した本人**で、呼ぶ側からは指定できません — 誰として書くのかを
 * 呼び出し側に決めさせると、他人の名前で書けてしまいます
 * (画面の追加ボタンが「寺井 として足す」と自分の名前を出すのはこのため)。
 */
router.post('/event-reports/:projectId/kpt', requirePermission('sales', 'editor'), async (req, res) => {
  const { kind, body } = req.body ?? {};
  if (!isKptKind(kind)) throw new AppError(400, 'VALIDATION_ERROR', 'kind は keep / problem / try');
  if (typeof body !== 'string') throw new AppError(400, 'VALIDATION_ERROR', 'body は必須です');
  res.status(201).json({
    success: true,
    data: await addKpt(req.params.projectId as string, kind, body, req.user!.id),
  });
});

router.put('/kpt/:id', requirePermission('sales', 'editor'), async (req, res) => {
  const { body } = req.body ?? {};
  if (typeof body !== 'string') throw new AppError(400, 'VALIDATION_ERROR', 'body は必須です');
  res.json({ success: true, data: await updateKpt(req.params.id as string, body, req.user!.id) });
});

/** AI の下書きを「そのまま採る」。**無修正で採ったことが教師データになる** */
router.post('/kpt/:id/confirm', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({ success: true, data: await confirmKpt(req.params.id as string, req.user!.id) });
});

router.delete('/kpt/:id', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({ success: true, data: await deleteKpt(req.params.id as string, req.user!.id) });
});

/** AI に下書きを起こさせる (手で押す口。定時実行は scheduler が同じ関数を呼ぶ) */
router.post('/event-reports/:projectId/kpt/draft', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({ success: true, data: await generateKptDraft(req.params.projectId as string, req.user!.id) });
});

router.post('/event-reports/:projectId/photos', requirePermission('sales', 'editor'), async (req, res) => {
  const { box_file_id, caption, sort_order } = req.body;
  if (!box_file_id) throw new AppError(400, 'VALIDATION_ERROR', 'box_file_id は必須です');
  res.status(201).json({ success: true, data: await keepReportService.attachEventPhoto(req.params.projectId as string, { box_file_id, caption, sort_order }) });
});

router.delete('/event-photos/:photoId', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({ success: true, data: await keepReportService.detachEventPhoto(req.params.photoId as string) });
});

// ============ 月次予算・損益 ============

router.get('/monthly-pl/:ym', async (req, res) => {
  if (!YM_RE.test(req.params.ym as string)) throw new AppError(400, 'VALIDATION_ERROR', '年月は YYYY-MM');
  res.json({ success: true, data: await keepReportService.getMonthlyPl(req.params.ym as string) });
});

router.put('/monthly-budget/:ym', requirePermission('sales', 'editor'), async (req, res) => {
  if (!YM_RE.test(req.params.ym as string)) throw new AppError(400, 'VALIDATION_ERROR', '年月は YYYY-MM');
  const { revenue, cogs_fixed, cogs_variable, sga, operating_profit } = req.body;
  res.json({ success: true, data: await keepReportService.upsertBudget(req.params.ym as string, { revenue, cogs_fixed, cogs_variable, sga, operating_profit }) });
});

router.put('/monthly-override/:ym', requirePermission('sales', 'editor'), async (req, res) => {
  if (!YM_RE.test(req.params.ym as string)) throw new AppError(400, 'VALIDATION_ERROR', '年月は YYYY-MM');
  const { cogs_fixed_actual, sga_actual, note } = req.body;
  res.json({ success: true, data: await keepReportService.upsertOverride(req.params.ym as string, { cogs_fixed_actual, sga_actual, note }) });
});

// ============ 議事録サマリ ============

router.get('/minutes', async (req, res) => {
  res.json({
    success: true,
    data: await keepReportService.listMinutes({
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    }),
  });
});

router.put('/minutes/:date', requirePermission('sales', 'editor'), async (req, res) => {
  if (!DATE_RE.test(req.params.date as string)) throw new AppError(400, 'VALIDATION_ERROR', '開催日は YYYY-MM-DD');
  const { decisions, topics, next_meeting_date } = req.body;
  res.json({ success: true, data: await keepReportService.upsertMinutes(req.params.date as string, { decisions, topics, next_meeting_date }) });
});

export default router;
