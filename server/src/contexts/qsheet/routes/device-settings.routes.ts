// 収録設定・配信設定（機器設定）の7エンドポイント。
//
// **1本のファイルに収録と配信の両方**が入る（recording.routes.ts にしない — impl doc §4）。
// CRUD・copy-from の実処理は `services/device-settings.service.ts`、
// Excel は `services/device-excel.service.ts`、点検は `../device-settings-preflight.ts`、
// `:ownerKey` の解決は `../device-settings-owner.ts` に分けてある（このファイル自体を
// 400行に収めるため）。
import { Router, Request, Response } from 'express';
import { queryOne, queryAll } from '../../../shared/db/connection';
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
import {
  buildDeviceSettingsWorkbook,
  buildDeviceSettingsPreview,
  deviceSettingsFilename,
  excelResponse,
} from '../services/device-excel.service';

const router = Router({ mergeParams: true });
router.use(requireAuth, requirePermission('qsheet'));

const notFound = (res: Response) =>
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '見つかりません' } });

/**
 * zod の指摘を「どの行の何が悪いか」が分かる1文にする。
 *
 * ⚠️ 以前は `issues[0].message` をそのまま返し、画面はそれすら捨てて
 * 「保存に失敗しました」とだけ出していた。配信先が10件あるとき、
 * **どの行が悪いのか利用者には一生分からなかった**（実機で確認）。
 */
function validationMessage(
  issues: { path: (string | number)[]; message: string }[],
  rows: unknown[],
  labelOf: (row: any, i: number) => string
): string {
  const first = issues[0];
  if (!first) return '入力を確認してください';
  const idx = typeof first.path[0] === 'number' ? (first.path[0] as number) : null;
  const where = idx !== null ? labelOf(rows[idx], idx) : null;
  const head = where ? `${where}: ` : '';
  const more = issues.length > 1 ? `（ほか ${issues.length - 1} 件）` : '';
  return `${head}${first.message}${more}`;
}

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
// owner の文脈（画面のヘッダー・ミニアプリ切替・簡易入口からのハブ遷移が使う）
//
// ⚠️ 収録設定・配信設定の GET/PUT は :ownerKey が案件か番組かを画面側に返さない
// （RecordingSettings/StreamingSettings は明細だけ）。ヘッダーに案件名・GLS番号を出し、
// Qシート/スケジュール表への切替リンク（?project=/?program=）や、簡易入口
// （DeviceSettingsHome）から正規のハブ（/qsheet/projects/:id・/qsheet/programs/:id）へ
// 飛ぶために、resolveOwner の結果を画面へ渡す小さな窓をここに1つ足す。
// ============================================================
router.get('/:ownerKey/context', async (req: Request, res: Response) => {
  const owner = await resolveOwner(req.user!, String(req.params.ownerKey), req.query.date as string | undefined);
  if (!owner) return notFound(res);

  if (owner.kind === 'project') {
    const row = await queryOne('SELECT id, name, gls_number FROM projects WHERE id = $1', [owner.projectId]);
    if (!row) return notFound(res);
    res.json({ success: true, data: { kind: 'project', id: row.id, name: row.name, glsNumber: row.gls_number ?? null } });
    return;
  }
  if (owner.kind === 'program') {
    const row = await queryOne('SELECT id, name FROM qsheet_programs WHERE id = $1', [owner.programId]);
    if (!row) return notFound(res);
    res.json({ success: true, data: { kind: 'program', id: row.id, name: row.name, glsNumber: null } });
    return;
  }
  // kind: 'doc' はまだ resolveOwner が返さない（doc_no 未着手・device-settings-owner.ts 参照）
  return notFound(res);
});

// ============================================================
// 実施日の候補
//
// ⚠️ これが無かったため、画面には実施日を選ぶ手段が1つも無かった。
// URL の `?date=` でしか変えられず、入口（ミニアプリのタイル）は date を付けないので、
// サーバーは常に「最新の service_date」を返す。つまり **案件につき事実上1日ぶんしか
// 持てず、過去日の設定は二度と開けない**状態だった（設計 08 §1-2 は
// 「案件＋実施日で1セット」と決めている）。
//
// 候補は3つを混ぜて返す:
//   ① すでに収録設定がある日   ② すでに配信設定がある日   ③ その案件のスケジュール表の日
// ============================================================
router.get('/:ownerKey/dates', async (req: Request, res: Response) => {
  const owner = await resolveOwner(req.user!, String(req.params.ownerKey));
  if (!owner) return notFound(res);

  const col = owner.kind === 'project' ? 'project_id' : owner.kind === 'program' ? 'program_id' : 'doc_no';
  const value = owner.kind === 'project' ? owner.projectId : owner.kind === 'program' ? owner.programId : owner.docNo;

  const [rec, str, sch] = await Promise.all([
    queryAll(`SELECT to_char(service_date,'YYYY-MM-DD') AS d FROM qsheet_recording_settings
              WHERE ${col} = $1 AND deleted_at IS NULL`, [value]),
    queryAll(`SELECT to_char(service_date,'YYYY-MM-DD') AS d FROM qsheet_streaming_settings
              WHERE ${col} = $1 AND deleted_at IS NULL`, [value]),
    // スケジュール表は案件・番組のどちらにも紐づきうる
    owner.kind === 'doc'
      ? Promise.resolve([])
      : queryAll(`SELECT DISTINCT to_char(service_date,'YYYY-MM-DD') AS d FROM qsheet_schedules
                  WHERE ${owner.kind === 'project' ? 'project_id' : 'program_id'} = $1
                    AND deleted_at IS NULL AND service_date IS NOT NULL`, [value]),
  ]);

  const recSet = new Set(rec.map((r) => r.d as string));
  const strSet = new Set(str.map((r) => r.d as string));
  const all = new Set<string>([...recSet, ...strSet, ...sch.map((r) => r.d as string)]);

  const dates = [...all].sort().map((date) => ({
    date,
    hasRecording: recSet.has(date),
    hasStreaming: strSet.has(date),
  }));
  res.json({ success: true, data: { dates } });
});

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
    const rows = Array.isArray(req.body?.decks) ? req.body.decks : [];
    const message = validationMessage(parsed.error.issues, rows, (r, i) => String(r?.deckId ?? `${i + 1}行目`));
    res.status(400).json({ success: false, error: { code: 'VALIDATION', message } });
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
    const rows = Array.isArray(req.body?.destinations) ? req.body.destinations : [];
    const message = validationMessage(destParsed.error.issues, rows, (r, i) =>
      `${r?.encoderId ?? `${i + 1}行目`}${r?.name ? ` / ${r.name}` : ' の新しい配信先'}`);
    res.status(400).json({ success: false, error: { code: 'VALIDATION', message } });
    return;
  }
  const meetingsParsed = MeetingsSchema.safeParse(req.body?.meetings ?? []);
  if (!meetingsParsed.success) {
    const rows = Array.isArray(req.body?.meetings) ? req.body.meetings : [];
    const message = validationMessage(meetingsParsed.error.issues, rows, (r, i) =>
      `WEB会議 ${r?.label || r?.tool || `${i + 1}本目`}`);
    res.status(400).json({ success: false, error: { code: 'VALIDATION', message } });
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

  // 「見出しの見本」に出す先頭数行と、保存されるファイル名。
  // ⚠️ **実物と同じ整形（buildSheetSpecs）を通す。** 別々に組むと
  // 「見本と実物が違う」といういちばん気づけない壊れ方をする。
  const serviceDate = recording?.serviceDate ?? streaming?.serviceDate ?? owner.date ?? jstDate();
  const sheetsParam = String(req.query.sheets ?? 'recording,streaming');
  const sheets = sheetsParam
    .split(',')
    .filter((x): x is 'recording' | 'streaming' => x === 'recording' || x === 'streaming');
  const ownerLabel = await ownerLabelOf(owner);
  const preview = buildDeviceSettingsPreview({
    ownerLabel,
    serviceDate,
    sheets: sheets.length ? sheets : ['recording', 'streaming'],
    decks: recording?.decks ?? [],
    destinations: destinations as never,
    keyMode: 'blank',
  });

  res.json({
    success: true,
    data: {
      ...result,
      preview,
      filename: deviceSettingsFilename(ownerLabel, serviceDate),
    },
  });
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
