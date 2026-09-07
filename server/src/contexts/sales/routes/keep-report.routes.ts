import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { keepReportService } from '../services/keep-report.service';
import {
  addKpt, updateKpt, confirmKpt, deleteKpt, generateKptDraft, isKptKind,
} from '../services/kpt.service';
// 2026年10月の事業再編（P2 Round 1）: 月次予算・損益は会社（entity_code）ごと
import { getLegalEntity, type LegalEntityCode } from '../../platform/services/legal-entity.service';
import { CURRENT_ENTITY_CODE } from '../../../shared/constants/entity-default';

// 隔週キープ資料 (報告資料) の基礎データ編集 API。
// UI (案件管理アプリ /sales/keep-report) 用 — MCP ツールと同じ keepReportService を通る。

const router = Router();
router.use(requireAuth, requirePermission('sales'));

const YM_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** クエリの entity_code を検査する（`money-rules.routes.ts` と同じ形） */
async function resolveEntityCode(raw: unknown): Promise<LegalEntityCode> {
  if (raw === undefined || raw === null || raw === '') return CURRENT_ENTITY_CODE;
  if (typeof raw !== 'string' || !(await getLegalEntity(raw))) {
    throw new AppError(400, 'VALIDATION_ERROR', '不正な計上会社です');
  }
  return raw as LegalEntityCode;
}

/**
 * 金額欄: 未指定は「渡さなかった＝今の値を保つ」（undefined）、null / 空文字は「消す」（null）、
 * それ以外は整数（円）だけ。小数・文字列をそのまま通すと BIGINT 列で Postgres が例外を返し、
 * 意図した 400 でなく素の 500 になる。「消す」と「保つ」の区別は `keepReportService.upsertBudget` が守る
 */
function readAmount(v: unknown, label: string): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) : NaN);
  if (!Number.isInteger(n)) throw new AppError(400, 'VALIDATION_ERROR', `${label}は整数（円）で送ってください`);
  return n;
}

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

// `entity_code=all` は隔週キープの「全体（統合）」＝3社の合計（予算も合計）。省略時は今の会社1社ぶん
router.get('/monthly-pl/:ym', async (req, res) => {
  if (!YM_RE.test(req.params.ym as string)) throw new AppError(400, 'VALIDATION_ERROR', '年月は YYYY-MM');
  const scope = req.query.entity_code === 'all' ? 'all' as const : await resolveEntityCode(req.query.entity_code);
  res.json({ success: true, data: await keepReportService.getMonthlyPl(req.params.ym as string, scope) });
});

/** 期間内の全会社の予算と補正値（「お金のルール」の入力表・隔週キープの推移） */
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
  const entityCode = await resolveEntityCode(req.query.entity_code);
  const budget = await keepReportService.getBudget(ym, entityCode);
  res.json({ success: true, data: { year_month: ym, entity_code: entityCode, found: !!budget, budget } });
});

router.put('/monthly-budget/:ym', requirePermission('sales', 'editor'), async (req, res) => {
  if (!YM_RE.test(req.params.ym as string)) throw new AppError(400, 'VALIDATION_ERROR', '年月は YYYY-MM');
  const body = req.body ?? {};
  const entityCode = await resolveEntityCode(body.entity_code);
  const fields = {
    revenue: readAmount(body.revenue, '売上目標'),
    cogs_fixed: readAmount(body.cogs_fixed, '固定原価目標'),
    cogs_variable: readAmount(body.cogs_variable, '変動原価目標'),
    sga: readAmount(body.sga, '販管費目標'),
    operating_profit: readAmount(body.operating_profit, '営業利益目標'),
  };
  res.json({ success: true, data: await keepReportService.upsertBudget(req.params.ym as string, fields, entityCode) });
});

router.put('/monthly-override/:ym', requirePermission('sales', 'editor'), async (req, res) => {
  if (!YM_RE.test(req.params.ym as string)) throw new AppError(400, 'VALIDATION_ERROR', '年月は YYYY-MM');
  const body = req.body ?? {};
  const entityCode = await resolveEntityCode(body.entity_code);
  if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'note は文字列');
  }
  const fields = {
    cogs_fixed_actual: readAmount(body.cogs_fixed_actual, '償却費の経理確定値'),
    sga_actual: readAmount(body.sga_actual, '販管費の経理確定値'),
    note: body.note as string | null | undefined,
  };
  res.json({ success: true, data: await keepReportService.upsertOverride(req.params.ym as string, fields, entityCode) });
});

// ============ 稼働率の数え方（keep_settings・docs/design/v4/keep-report.md §5.4）============

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
