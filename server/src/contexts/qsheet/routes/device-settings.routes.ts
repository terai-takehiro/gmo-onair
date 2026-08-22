// 収録設定・配信設定（機器設定）の7エンドポイント。
//
// **1本のファイルに収録と配信の両方**が入る（recording.routes.ts にしない — impl doc §4）。
// CRUD・copy-from の実処理は `services/device-settings.service.ts`、
// Excel は `services/device-excel.service.ts`、点検は `../device-settings-preflight.ts`、
// `:ownerKey` の解決は `../device-settings-owner.ts` に分けてある（このファイル自体を
// 400行に収めるため）。
import { Router, Request, Response } from 'express';
import { queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { jstDate } from '../../../shared/utils/jst';
import { resolveOwner } from '../device-settings-owner';
import {
  DecksSchema,
  DestinationsSchema,
  MeetingsSchema,
} from '../device-settings-types';
import { buildPreflight } from '../device-settings-preflight';
import * as svc from '../services/device-settings.service';
import { buildDeviceSettingsWorkbook, excelResponse } from '../services/device-excel.service';

const router = Router({ mergeParams: true });
router.use(requireAuth, requirePermission('qsheet'));

const notFound = (res: Response) =>
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '見つかりません' } });

/** 案件名 / GLS 番号 / 番組名（Excel ファイル名用） */
async function ownerLabelOf(owner: Awaited<ReturnType<typeof resolveOwner>>): Promise<string> {
  if (!owner) return 'unknown';
  if (owner.kind === 'project') {
    const row = await queryOne('SELECT gls_number, name FROM projects WHERE id = $1', [owner.projectId]);
    return (row?.gls_number as string) || (row?.name as string) || owner.projectId;
  }
  if (owner.kind === 'program') {
    const row = await queryOne('SELECT name FROM qsheet_programs WHERE id = $1', [owner.programId]);
    return (row?.name as string) || owner.programId;
  }
  return owner.docNo;
}

// ============================================================
// 収録設定
// ============================================================
router.get('/:ownerKey/recording', async (req: Request, res: Response) => {
  const owner = await resolveOwner(req.user!, String(req.params.ownerKey), req.query.date as string | undefined);
  if (!owner) return notFound(res);
  const data = await svc.getRecording(owner);
  res.json({ success: true, data });
});

router.put('/:ownerKey/recording', requirePermission('qsheet', 'editor'), async (req: Request, res: Response) => {
  const owner = await resolveOwner(req.user!, String(req.params.ownerKey), req.query.date as string | undefined);
  if (!owner) return notFound(res);
  const serviceDate = typeof req.body?.serviceDate === 'string' ? req.body.serviceDate : owner.date;
  if (!serviceDate) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'serviceDate は必須です' } });
    return;
  }
  const parsed = DecksSchema.safeParse(req.body?.decks ?? []);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? '入力を確認してください' } });
    return;
  }
  await svc.putRecording(owner, serviceDate, parsed.data, req.user!.id);
  res.json({ success: true });
});

// ============================================================
// 配信設定
// ============================================================
router.get('/:ownerKey/streaming', async (req: Request, res: Response) => {
  const owner = await resolveOwner(req.user!, String(req.params.ownerKey), req.query.date as string | undefined);
  if (!owner) return notFound(res);
  const data = await svc.getStreaming(owner);
  res.json({ success: true, data });
});

router.put('/:ownerKey/streaming', requirePermission('qsheet', 'editor'), async (req: Request, res: Response) => {
  const owner = await resolveOwner(req.user!, String(req.params.ownerKey), req.query.date as string | undefined);
  if (!owner) return notFound(res);
  const serviceDate = typeof req.body?.serviceDate === 'string' ? req.body.serviceDate : owner.date;
  if (!serviceDate) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'serviceDate は必須です' } });
    return;
  }
  const destParsed = DestinationsSchema.safeParse(req.body?.destinations ?? []);
  if (!destParsed.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION', message: destParsed.error.issues[0]?.message ?? '入力を確認してください' } });
    return;
  }
  const meetingsParsed = MeetingsSchema.safeParse(req.body?.meetings ?? []);
  if (!meetingsParsed.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION', message: meetingsParsed.error.issues[0]?.message ?? '入力を確認してください' } });
    return;
  }
  await svc.putStreaming(owner, serviceDate, destParsed.data, meetingsParsed.data, req.user!.id);
  res.json({ success: true });
});

// ============================================================
// 点検（preflight）
// ============================================================
router.post('/:ownerKey/settings/preflight', async (req: Request, res: Response) => {
  const owner = await resolveOwner(req.user!, String(req.params.ownerKey), req.query.date as string | undefined);
  if (!owner) return notFound(res);
  const [recording, streaming] = await Promise.all([svc.getRecording(owner), svc.getStreaming(owner)]);
  const destinations = (streaming?.destinations ?? []).map(({ streamKeyMasked: _masked, hasStreamKey, ...rest }) => ({
    ...rest,
    // 点検はキーの「有無」だけで足りる（RTMP_KEY_EMPTY の判定に平文は要らない）
    streamKey: hasStreamKey ? '****' : undefined,
  }));
  const result = buildPreflight(recording?.decks ?? [], destinations);
  res.json({ success: true, data: result });
});

// ============================================================
// Excel を書き出す
// ============================================================
router.get('/:ownerKey/settings/export-xlsx', requirePermission('qsheet', 'editor'), async (req: Request, res: Response) => {
  const owner = await resolveOwner(req.user!, String(req.params.ownerKey), req.query.date as string | undefined);
  if (!owner) return notFound(res);

  const sheetsParam = String(req.query.sheets ?? 'recording,streaming');
  const sheets = sheetsParam.split(',').filter((s): s is 'recording' | 'streaming' => s === 'recording' || s === 'streaming');
  if (sheets.length === 0) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: '出すシートを1つ以上選んでください' } });
    return;
  }
  const keyMode = req.query.keyMode === 'plain' ? 'plain' : 'blank';

  const [recording, streaming, ownerLabel] = await Promise.all([
    svc.getRecording(owner),
    svc.getStreaming(owner),
    ownerLabelOf(owner),
  ]);
  const serviceDate = recording?.serviceDate ?? streaming?.serviceDate ?? owner.date ?? jstDate();

  // Excel に出す配信先の姿には streamKeyEnc が要る（マスク済みの GET 応答には無い）。
  // ここだけ生の保存行を引き直す（平文は decrypt 時にだけメモリ上に載り、レスポンスには出ない）。
  const ownerCol = owner.kind === 'project' ? 'project_id' : owner.kind === 'program' ? 'program_id' : 'doc_no';
  const ownerValue = owner.kind === 'project' ? owner.projectId : owner.kind === 'program' ? owner.programId : owner.docNo;
  const rawStreamRow = await queryOne(
    `SELECT destinations FROM qsheet_streaming_settings WHERE ${ownerCol} = $1 AND service_date = $2 AND deleted_at IS NULL`,
    [ownerValue, serviceDate]
  );

  const { buffer, filename } = buildDeviceSettingsWorkbook({
    ownerLabel,
    serviceDate,
    sheets,
    decks: recording?.decks ?? [],
    destinations: (rawStreamRow?.destinations as any[]) ?? [],
    keyMode,
  });

  // 選んだシートの分だけ last_exported_* を記録する（選ばなかった側の表は触らない）
  await Promise.all(sheets.map((s) => svc.recordExport(s, owner, serviceDate, req.user!.id, filename)));

  excelResponse(res, filename, buffer);
});

// ============================================================
// copy-from（前回の設定を写す）
// ============================================================
router.post('/:ownerKey/settings/copy-from', requirePermission('qsheet', 'editor'), async (req: Request, res: Response) => {
  const owner = await resolveOwner(req.user!, String(req.params.ownerKey), req.query.date as string | undefined);
  if (!owner) return notFound(res);
  const serviceDate = owner.date ?? jstDate();

  const fromKey = req.body?.from?.ownerKey;
  const fromDate = req.body?.from?.date;
  if (typeof fromKey !== 'string' || typeof fromDate !== 'string') {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'from.ownerKey / from.date は必須です' } });
    return;
  }
  const from = await resolveOwner(req.user!, fromKey, fromDate);
  if (!from) return notFound(res);

  const what = Array.isArray(req.body?.what)
    ? req.body.what.filter((w: unknown): w is 'recording' | 'streaming' => w === 'recording' || w === 'streaming')
    : (['recording', 'streaming'] as const);

  const result = await svc.copyFrom(owner, serviceDate, from, [...what], req.user!.id);
  res.json({ success: true, data: result });
});

export default router;
