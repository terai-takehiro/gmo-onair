import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { keepReportService } from '../services/keep-report.service';
import { isBusinessEntity, isEntityScope, type BusinessEntity, type EntityScope } from '../services/project-entity';
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

// ============ 月次予算・損益（主体別・migration 283）============
//
// `entity` は gss / gscs / gig（`shared/src/keepReport/types.ts` の BusinessEntity）。
// 予算・補正の既定は gss（既存の呼び出しがそのまま動く）、損益の既定は all（主体の合計）。
// 予算の入力画面は設定「お金のルール」（keep-report.md §8）。

/** クエリ・本文の entity を読む。空なら既定、知らない値は 400 */
function readEntity(v: unknown, fallback: BusinessEntity): BusinessEntity {
  if (v === undefined || v === null || v === '') return fallback;
  if (!isBusinessEntity(v)) throw new AppError(400, 'VALIDATION_ERROR', 'entity は gss / gscs / gig');
  return v;
}
function readScope(v: unknown): EntityScope {
  if (v === undefined || v === null || v === '') return 'all';
  if (!isEntityScope(v)) throw new AppError(400, 'VALIDATION_ERROR', 'entity は all / gss / gscs / gig');
  return v;
}
/**
 * 金額欄: 未指定は「渡さなかった」、null / 空文字は null、それ以外は整数（円）だけ。
 * 小数・文字列をそのまま通すと BIGINT 列で Postgres が例外を返し、意図した 400 でなく素の 500 になる
 */
function readAmount(v: unknown, label: string): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) : NaN);
  if (!Number.isInteger(n)) throw new AppError(400, 'VALIDATION_ERROR', `${label}は整数（円）で送ってください`);
  return n;
}

router.get('/monthly-pl/:ym', async (req, res) => {
  if (!YM_RE.test(req.params.ym as string)) throw new AppError(400, 'VALIDATION_ERROR', '年月は YYYY-MM');
  res.json({ success: true, data: await keepReportService.getMonthlyPl(req.params.ym as string, readScope(req.query.entity)) });
});

/** 期間内の全主体の予算と補正値（「お金のルール」の入力表・資料の推移） */
router.get('/monthly-budgets', async (req, res) => {
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  if (!from || !to || !YM_RE.test(from) || !YM_RE.test(to)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'from / to は YYYY-MM で両方必要です');
  }
  const [budgets, overrides] = await Promise.all([
    keepReportService.listBudgets({ from, to }),
    keepReportService.listOverrides({ from, to }),
  ]);
  res.json({ success: true, data: { from, to, budgets, overrides } });
});

router.get('/monthly-budget/:ym', async (req, res) => {
  const ym = req.params.ym as string;
  if (!YM_RE.test(ym)) throw new AppError(400, 'VALIDATION_ERROR', '年月は YYYY-MM');
  const entity = readEntity(req.query.entity, 'gss');
  const budget = await keepReportService.getBudget(ym, entity);
  res.json({ success: true, data: { year_month: ym, entity, found: !!budget, budget } });
});

router.put('/monthly-budget/:ym', requirePermission('sales', 'editor'), async (req, res) => {
  if (!YM_RE.test(req.params.ym as string)) throw new AppError(400, 'VALIDATION_ERROR', '年月は YYYY-MM');
  const body = req.body ?? {};
  const entity = readEntity(body.entity, 'gss');
  const fields = {
    revenue: readAmount(body.revenue, '売上目標'),
    cogs_fixed: readAmount(body.cogs_fixed, '固定原価目標'),
    cogs_variable: readAmount(body.cogs_variable, '変動原価目標'),
    sga: readAmount(body.sga, '販管費目標'),
    operating_profit: readAmount(body.operating_profit, '営業利益目標'),
  };
  res.json({ success: true, data: await keepReportService.upsertBudget(req.params.ym as string, fields, entity) });
});

router.put('/monthly-override/:ym', requirePermission('sales', 'editor'), async (req, res) => {
  if (!YM_RE.test(req.params.ym as string)) throw new AppError(400, 'VALIDATION_ERROR', '年月は YYYY-MM');
  const body = req.body ?? {};
  const entity = readEntity(body.entity, 'gss');
  if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'note は文字列');
  }
  const fields = {
    cogs_fixed_actual: readAmount(body.cogs_fixed_actual, '償却費の経理確定値'),
    sga_actual: readAmount(body.sga_actual, '販管費の経理確定値'),
    note: body.note as string | null | undefined,
  };
  res.json({ success: true, data: await keepReportService.upsertOverride(req.params.ym as string, fields, entity) });
});

// ============ 稼働率の数え方（keep_settings・keep-report.md §5.4）============

router.get('/utilization-settings', async (_req, res) => {
  res.json({ success: true, data: await keepReportService.getUtilizationSettings() });
});

/** 数え方を変えると過去の稼働率も変わるので、営業マネージャーだけ */
router.put('/utilization-settings', requirePermission('sales', 'manager'), async (req, res) => {
  res.json({ success: true, data: await keepReportService.setUtilizationSettings(req.body, req.user!.id) });
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
