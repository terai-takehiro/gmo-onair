import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { keepReportService } from '../services/keep-report.service';
import {
  getDeck, listMeetings, saveAnswers, saveThemeNote, addAgendaItem,
  removeAgendaItem, confirmDeck, KEEP_PAGES, FIXED_THEMES, OPTIONAL_AGENDA,
  REGULAR_AGENDA, FORMAT_VERSION,
} from '../services/keep-deck.service';

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
  const { headline, highlights, attendees_onsite, attendees_online, attendees_note, report_status, reported_at } = req.body;
  if (report_status !== undefined && !['draft', 'confirmed'].includes(report_status)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'report_status は draft / confirmed');
  }
  if (reported_at !== undefined && reported_at !== null && reported_at !== '' && !DATE_RE.test(reported_at)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'reported_at は YYYY-MM-DD');
  }
  const result = await keepReportService.upsertEventReport(req.params.projectId as string, {
    headline, highlights, attendees_onsite, attendees_online, attendees_note, report_status,
    reported_at: reported_at === '' ? undefined : reported_at,
  });
  res.json({ success: true, data: result });
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


// ============ 隔週キープの資料 (29章 35a-c) ============
//
// 型は Ver.2.5 で固定。ここが返すのは「どのページを誰が埋めるか」と
// 「人が書くところ」だけ。数字は既存のサービスから読む (写し取らない)。

const uid = (req: any) => String(req.user?.id ?? '');

// 型そのもの (回に依らない)。29a「ページごとにAIが埋める/人が書くを決める」に使う
router.get('/deck/format', async (_req, res) => {
  res.json({
    success: true,
    data: {
      format_version: FORMAT_VERSION,
      pages: KEEP_PAGES,
      themes: FIXED_THEMES,
      regular_agenda: REGULAR_AGENDA,
      optional_agenda: OPTIONAL_AGENDA,
    },
  });
});

// 回の一覧。`/deck/:date` より前に置くこと
router.get('/deck/list', async (_req, res) => {
  res.json({ success: true, data: await listMeetings() });
});

// その回の資料を組み立てて返す (無ければ作る = 冪等)
router.get('/deck/:date', async (req, res) => {
  res.json({ success: true, data: await getDeck(String(req.params.date), uid(req)) });
});

// ①の3行と次回開催日。空でも進める
router.put('/deck/:date/answers', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({ success: true, data: await saveAnswers(String(req.params.date), req.body ?? {}, uid(req)) });
});

// ③のテーマごとの1行
router.put('/deck/:date/themes/:no', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({
    success: true,
    data: await saveThemeNote(String(req.params.date), Number(req.params.no), req.body ?? {}, uid(req)),
  });
});

// ④以降の議題を足す / 外す (無い回はページも作らない)
router.post('/deck/:date/agenda', requirePermission('sales', 'editor'), async (req, res) => {
  res.status(201).json({ success: true, data: await addAgendaItem(String(req.params.date), req.body ?? {}, uid(req)) });
});

router.delete('/deck/:date/agenda/:id', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({ success: true, data: await removeAgendaItem(String(req.params.date), String(req.params.id), uid(req)) });
});

// 確定する。落ちているチェック項目があっても止めない (止めると会議が始められない)
router.post('/deck/:date/confirm', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({ success: true, data: await confirmDeck(String(req.params.date), uid(req)) });
});

// PDF にする。**配布は PDF だけ** (PowerPoint 出力は作らない)
router.get('/deck/:date/pdf', async (req, res) => {
  const date = String(req.params.date);
  const deck = await getDeck(date, uid(req));
  const { generateKeepDeckPdf } = await import('../../../shared/services/keep-pdf.service');
  const pdf = await generateKeepDeckPdf(deck as any);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="keep-${date}.pdf"`);
  res.send(pdf);
});

export default router;
