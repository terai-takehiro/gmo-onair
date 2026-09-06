import { Router } from 'express';
import { requireAuth, requireAnyPermission, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  getPackForMeeting, freezePack, listPacks, parseScope, getInputs, upsertInput, assertMeetingDate,
} from '../services/keep-pack-store.service';
import { resolveMeetings } from '../services/keep-pack.service';
import { getSlackDraftForMeeting } from '../services/keep-slack-draft.service';

// 日常業務アプリ (dailyops) — 隔週キープの「定例報告パック」API（docs/design/v4/keep-report.md §9）。
//
// 読むのは `dailyops` か `sales` の reader（財務の数字なので営業・経理も見る）、
// 凍結・手入力は `dailyops` の editor（週報の確定と同じ人）。
// パックの中身は `keep-pack.service.ts`、凍結と読み出しは `keep-pack-store.service.ts`
// （MCP の `get_keep_report_pack` も同じ `getPackForMeeting` を通る）。

const router = Router();
const canRead = [requireAuth, requireAnyPermission(['dailyops', 'sales'], 'reader')] as const;
const canEdit = [requireAuth, requirePermission('dailyops', 'editor')] as const;

/**
 * パック。凍結した版があればそれ、無ければ（または `live=1`）いまの数字。
 *   ?meeting=YYYY-MM-DD（省略時は次回の開催日）&entity_code=all|GJV|GSS|GMO&segment=all|internal|external&live=1
 * `entity_code` は計上会社（2026年10月の事業再編・`legal_entities.code`）。知らない値は 400
 * → { pack, frozen, pack_id }
 */
router.get('/keep/pack', ...canRead, async (req, res) => {
  const meeting = req.query.meeting ? String(req.query.meeting) : null;
  const live = req.query.live === '1' || req.query.live === 'true';
  const data = await getPackForMeeting({ meetingDate: meeting, entity: req.query.entity_code, segment: req.query.segment, live });
  res.json({ success: true, data });
});

/**
 * Slack の定例投稿の下書き（パックから組んだ mrkdwn の文。§6.2「Slack の定例投稿」の下準備）。
 * 引数と権限は GET /keep/pack と同じ。→ { text, pack_id, frozen, meeting_date }
 * AI ではない決定的な整形なので `ai_outputs` には残さない。bot が投稿したら投稿の id を版に残す（§10 条件3）
 */
router.get('/keep/slack-draft', ...canRead, async (req, res) => {
  const meeting = req.query.meeting ? String(req.query.meeting) : null;
  const live = req.query.live === '1' || req.query.live === 'true';
  const data = await getSlackDraftForMeeting({ meetingDate: meeting, entity: req.query.entity_code, segment: req.query.segment, live });
  res.json({ success: true, data });
});

/**
 * 凍結（週報の確定から呼ぶのが本線。単独でも可）。body { meeting_date, entity_code?, segment?, ops_report_id? }
 * → { pack_id, frozen_at, meeting_date }。同じ会議日・同じ絞り込みを 60 秒以内に凍結し直しても
 * 版は増えず、直前の版の id が返る（`freezePack`）
 */
router.post('/keep/pack/freeze', ...canEdit, async (req, res) => {
  const { meeting_date, entity_code, segment, ops_report_id } = req.body ?? {};
  if (!meeting_date) throw new AppError(400, 'VALIDATION_ERROR', 'meeting_date は必須です');
  const scope = parseScope(entity_code, segment);
  const frozen = await freezePack({
    meetingDate: String(meeting_date), entity: scope.entity, segment: scope.segment,
    opsReportId: ops_report_id ? String(ops_report_id) : null, userId: req.user!.id,
  });
  res.status(201).json({ success: true, data: { pack_id: frozen.id, frozen_at: frozen.frozen_at, meeting_date: frozen.pack.meeting_date } });
});

/** 凍結した版の一覧（中身は運ばない） */
router.get('/keep/packs', ...canRead, async (_req, res) => {
  res.json({ success: true, data: await listPacks() });
});

/** 次回・前回の開催日（議事録から。無ければ次の水曜と 14 日前） */
router.get('/keep/meetings', ...canRead, async (_req, res) => {
  res.json({ success: true, data: await resolveMeetings() });
});

/** 手入力（満足度など）: 会議日ぶんの一覧 */
router.get('/keep/inputs/:meeting', ...canRead, async (req, res) => {
  const meeting = assertMeetingDate(req.params.meeting, 'meeting');
  res.json({ success: true, data: await getInputs(meeting) });
});

/** 手入力の保存。body { key, value }。key ごとに value を丸ごと置き換える */
router.put('/keep/inputs/:meeting', ...canEdit, async (req, res) => {
  const { key, value } = req.body ?? {};
  const input = await upsertInput(String(req.params.meeting), key, value, req.user!.id);
  res.json({ success: true, data: input });
});

export default router;
