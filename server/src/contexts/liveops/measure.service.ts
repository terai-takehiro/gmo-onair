/**
 * 視聴者数の取得をサーバー側で回す — 計測の開始・停止・1回分の取得・復元。
 *
 * 実装設計: docs/design/v4/qsheet-v4-coding/impl/09-live-timer-impl.md §4〜§7
 *
 * - 取得は「計測」を明示的に始めて終える単位。同時に計測できるのは1案件だけ
 *   （DB の部分ユニーク索引 `liveops_single_measurement` が本体・§7）
 * - 自動停止は開始日の 23:59（JST）が既定。手入力で延ばせる（§5）
 * - 鍵は `liveops_org_settings` の組織共通の1本だけを使う（§6）
 */
import { randomUUID } from 'crypto';
import { queryOne, queryAll, execute } from '../../shared/db/connection';
import { jstDate } from '../../shared/utils/jst';
import { loadOrgKeys, loadOrgPollingIntervalSec } from './org-key';
import {
  fetchYoutube, fetchJstream, fetchZoom,
  extractErrorMessage, maskSecretsInMessage, extractYoutubeVideoId,
} from './viewer-sources.service';
import { getZoomToken } from './zoom-token';
import { getCount as getTeamsCount } from './teams-subscription';

/** このプロセスの印。単一プロセス前提（socket.ts の Map も同じ前提）。
 *  ⚠️ サーバーを2つに増やす日が来たら「奪う」を「奪わない」に変える必要がある
 *  （measure_owner ＋ ハートビートで生きている持ち主かを見る形にする）。いまは作らない。 */
const INSTANCE_ID = randomUUID();

const ticks = new Map<string, ReturnType<typeof setInterval>>();
const cycleCounts = new Map<string, number>();

const FAIL_LIMIT = 5;
const OK_LOG_EVERY_N_CYCLES = 10;
const KEEP_ROWS_AFTER_STOP = 500;

export type StopReason = 'manual' | 'auto' | 'failed' | 'no_key' | 'system';

/** 開始日（JST）の 23:59:59 を返す。⚠️ toISOString()／getHours() を使わない
 *  （コンテナは UTC で動き、Alpine には tzdata が無く TZ が効かないため）。 */
export function defaultMeasureUntil(now: Date = new Date()): Date {
  const ymd = jstDate(now);
  const [y, m, d] = ymd.split('-').map(Number);
  // JST は年中 UTC+9（サマータイム無し）。23:59:59 JST = 同じ日の 14:59:59 UTC
  return new Date(Date.UTC(y, m - 1, d, 14, 59, 59));
}

function clearTick(programId: string): void {
  const t = ticks.get(programId);
  if (t) { clearInterval(t); ticks.delete(programId); }
  cycleCounts.delete(programId);
}

function scheduleTick(programId: string, intervalSec: number): void {
  clearTick(programId);
  const timer = setInterval(() => {
    pollOnce(programId).catch((e) => console.warn('[liveops-measure] pollOnce failed:', (e as Error).message));
  }, intervalSec * 1000);
  ticks.set(programId, timer);
}

async function logPoll(
  programId: string,
  platform: string,
  level: 'ok' | 'error' | 'info',
  opts: { count?: number | null; units?: number; message?: string } = {},
): Promise<void> {
  try {
    const message = opts.message ? maskSecretsInMessage(opts.message) : null;
    await execute(
      `INSERT INTO liveops_poll_log (program_id, platform, level, count, units, message)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [programId, platform, level, opts.count ?? null, opts.units ?? 0, message],
    );
  } catch (e) {
    // ログが書けなくても計測は止めない（DB が瞬断していても setInterval は続ける）
    console.warn('[liveops-measure] failed to write poll log:', (e as Error).message);
  }
}

interface StartOpts {
  programId: string;
  userId: string;
  until?: string; // ISO。省略時は開始日の23:59 JST
  platforms?: string[];
}

export type StartResult =
  | { ok: true; program: Record<string, unknown> }
  | { ok: false; status: number; message: string; current?: Record<string, unknown> };

export async function startMeasurement(opts: StartOpts): Promise<StartResult> {
  const orgKeys = await loadOrgKeys();
  if (!orgKeys.youtubeApiKey && !orgKeys.jstreamToken && !orgKeys.zoom && !orgKeys.teams) {
    return { ok: false, status: 400, message: '組織共通の鍵が未設定です。設定ページで登録してください。' };
  }

  let until: Date;
  let untilKind: 'default' | 'manual';
  if (opts.until) {
    until = new Date(opts.until);
    if (isNaN(until.getTime())) return { ok: false, status: 400, message: '終了時刻の形式が不正です。' };
    if (until.getTime() <= Date.now()) return { ok: false, status: 400, message: '終了時刻が過ぎています。' };
    untilKind = 'manual';
  } else {
    until = defaultMeasureUntil();
    untilKind = 'default';
  }

  const platforms = opts.platforms && opts.platforms.length > 0
    ? opts.platforms
    : ['youtube', 'jstream', 'zoom', 'teams'];

  try {
    const rows = await queryAll(
      `UPDATE liveops_programs
          SET measuring = TRUE,
              measure_started_at = NOW(),
              measure_started_by = $2,
              measure_until = $3,
              measure_until_kind = $4,
              measure_platforms = $5::jsonb,
              measure_fail_count = 0,
              measure_owner = $6
        WHERE id = $1
          AND deleted_at IS NULL
          AND measuring = FALSE
          AND NOT EXISTS (SELECT 1 FROM liveops_programs WHERE measuring)
      RETURNING id`,
      [opts.programId, opts.userId, until, untilKind, JSON.stringify(platforms), INSTANCE_ID],
    );

    if (rows.length === 0) {
      const current = await queryOne(
        `SELECT id, name, measure_started_by, measure_started_at
           FROM liveops_programs WHERE measuring = TRUE AND deleted_at IS NULL LIMIT 1`,
        [],
      );
      return {
        ok: false, status: 409,
        message: current ? `いま「${current.name}」が計測中です。` : '別の案件がいま計測中です。',
        current,
      };
    }
  } catch (err: any) {
    if (err?.code === '23505') {
      const current = await queryOne(
        `SELECT id, name, measure_started_by, measure_started_at
           FROM liveops_programs WHERE measuring = TRUE AND deleted_at IS NULL LIMIT 1`,
        [],
      );
      return { ok: false, status: 409, message: '別の案件がいま計測中です。', current };
    }
    throw err;
  }

  const intervalSec = await loadOrgPollingIntervalSec();
  scheduleTick(opts.programId, intervalSec);
  await logPoll(opts.programId, 'system', 'info', { message: `計測を開始しました（終了予定: ${untilKind === 'manual' ? '手入力' : '開始日23:59 JST'}）` });

  const program = await queryOne('SELECT * FROM liveops_programs WHERE id = $1', [opts.programId]);
  return { ok: true, program: program ?? {} };
}

export async function stopMeasurement(programId: string, reason: StopReason, detail?: string): Promise<void> {
  clearTick(programId);
  await execute(
    `UPDATE liveops_programs
        SET measuring = FALSE, measure_owner = NULL
      WHERE id = $1 AND measuring = TRUE`,
    [programId],
  );
  await logPoll(programId, 'system', reason === 'manual' || reason === 'auto' ? 'info' : 'error', {
    message: detail ?? `計測を停止しました（理由: ${reason}）`,
  });

  // 計測が終わったら、この案件ぶんの記録は直近 500 行だけ残す
  try {
    await execute(
      `DELETE FROM liveops_poll_log
        WHERE program_id = $1
          AND id NOT IN (
            SELECT id FROM liveops_poll_log WHERE program_id = $1 ORDER BY at DESC LIMIT $2
          )`,
      [programId, KEEP_ROWS_AFTER_STOP],
    );
  } catch (e) {
    console.warn('[liveops-measure] poll log prune failed:', (e as Error).message);
  }
}

interface ProgramRow {
  id: string;
  measuring: boolean;
  measure_until: string | null;
  measure_platforms: string[];
  measure_fail_count: number;
  youtube_urls: Array<{ label: string; url: string }>;
  jstream_lpid: string | null;
  zoom_meeting_id: string | null;
  zoom_webinar_id: string | null;
  teams_meeting_url: string | null;
}

/** 1回分の取得。開始時に張った setInterval から呼ばれる。 */
export async function pollOnce(programId: string): Promise<void> {
  const row = (await queryOne(
    `SELECT id, measuring, measure_until, measure_platforms, measure_fail_count,
            youtube_urls, jstream_lpid, zoom_meeting_id, zoom_webinar_id, teams_meeting_url
       FROM liveops_programs WHERE id = $1 AND deleted_at IS NULL`,
    [programId],
  )) as unknown as ProgramRow | undefined;

  if (!row || !row.measuring) { clearTick(programId); return; }

  if (row.measure_until && new Date() > new Date(row.measure_until)) {
    await stopMeasurement(programId, 'auto');
    return;
  }

  const orgKeys = await loadOrgKeys();
  if (!orgKeys.youtubeApiKey && !orgKeys.jstreamToken && !orgKeys.zoom && !orgKeys.teams) {
    await stopMeasurement(programId, 'no_key', '組織共通の鍵が未設定です。計測を止めました。');
    return;
  }

  const platforms = new Set(row.measure_platforms ?? []);
  const cycle = (cycleCounts.get(programId) ?? 0) + 1;
  cycleCounts.set(programId, cycle);
  const writeOk = cycle % OK_LOG_EVERY_N_CYCLES === 0;

  let youtubeCount = 0;
  let jstreamCount = 0;
  let zoomCount = 0;
  let teamsCount = 0;
  const ytDetails: Array<{ label: string; url: string; count: number | null }> = [];
  let anyFailure = false;

  // YouTube: videoIds を束ねて呼んだら**毎回**ログを1行（units の消費を正しく数えるため）
  const ytUrls = row.youtube_urls ?? [];
  if (platforms.has('youtube') && ytUrls.length > 0 && orgKeys.youtubeApiKey) {
    try {
      const videoIds = ytUrls.map((u) => extractYoutubeVideoId(u.url)).filter(Boolean);
      const countMap = videoIds.length > 0 ? await fetchYoutube(orgKeys.youtubeApiKey, videoIds) : {};
      for (const u of ytUrls) {
        const vid = extractYoutubeVideoId(u.url);
        const count = vid ? (countMap[vid] ?? null) : null;
        ytDetails.push({ label: u.label, url: u.url, count });
        if (count != null) youtubeCount += count;
      }
      await logPoll(programId, 'youtube', 'ok', { count: youtubeCount, units: 1 });
    } catch (err) {
      anyFailure = true;
      for (const u of ytUrls) ytDetails.push({ label: u.label, url: u.url, count: null });
      await logPoll(programId, 'youtube', 'error', { units: 1, message: extractErrorMessage(err, 'YouTube API error') });
    }
  }

  if (platforms.has('jstream') && row.jstream_lpid && orgKeys.jstreamToken) {
    try {
      jstreamCount = await fetchJstream(orgKeys.jstreamToken, row.jstream_lpid);
      if (writeOk) await logPoll(programId, 'jstream', 'ok', { count: jstreamCount });
    } catch (err) {
      anyFailure = true;
      await logPoll(programId, 'jstream', 'error', { message: extractErrorMessage(err, 'Jstream API error') });
    }
  }

  if (platforms.has('zoom') && orgKeys.zoom && (row.zoom_meeting_id || row.zoom_webinar_id)) {
    try {
      const token = await getZoomToken(orgKeys.zoom.clientId, orgKeys.zoom.clientSecret, orgKeys.zoom.accountId);
      if (row.zoom_meeting_id) zoomCount += await fetchZoom(token, 'meeting', row.zoom_meeting_id);
      if (row.zoom_webinar_id) zoomCount += await fetchZoom(token, 'webinar', row.zoom_webinar_id);
      if (writeOk) await logPoll(programId, 'zoom', 'ok', { count: zoomCount });
    } catch (err) {
      anyFailure = true;
      await logPoll(programId, 'zoom', 'error', { message: extractErrorMessage(err, 'Zoom API error') });
    }
  }

  if (platforms.has('teams') && row.teams_meeting_url) {
    // Teams は push 通知で貯めた数を読むだけ（API を呼ばない・units は消費しない）
    teamsCount = getTeamsCount(programId);
    if (writeOk) await logPoll(programId, 'teams', 'ok', { count: teamsCount });
  }

  await execute(
    `INSERT INTO liveops_snapshots (id, program_id, youtube_count, jstream_count, zoom_count, teams_count, details)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
    [programId, youtubeCount, jstreamCount, zoomCount, teamsCount, JSON.stringify({ ytDetails })],
  );

  if (anyFailure) {
    const failCount = row.measure_fail_count + 1;
    await execute('UPDATE liveops_programs SET measure_fail_count = $2 WHERE id = $1', [programId, failCount]);
    if (failCount >= FAIL_LIMIT) {
      await stopMeasurement(programId, 'failed', `取得が${FAIL_LIMIT}サイクル連続で失敗したため計測を止めました。`);
    }
  } else {
    await execute(
      'UPDATE liveops_programs SET measure_fail_count = 0, measure_last_ok_at = NOW() WHERE id = $1',
      [programId],
    );
  }
}

/** サーバー起動時に呼ぶ。measuring=true の行を復元する。 */
export async function restoreMeasurements(): Promise<void> {
  const rows = (await queryAll(
    `SELECT id, measure_until FROM liveops_programs WHERE measuring = TRUE AND deleted_at IS NULL`,
    [],
  )) as unknown as Array<{ id: string; measure_until: string | null }>;

  if (rows.length > 1) {
    // 部分ユニーク索引がある以上ここには来ないはずだが、防御的に全部止める
    for (const row of rows) {
      await stopMeasurement(row.id, 'system', '再起動時に計測中の行が複数見つかったため全て停止しました。');
    }
    return;
  }

  for (const row of rows) {
    if (row.measure_until && new Date() > new Date(row.measure_until)) {
      await stopMeasurement(row.id, 'auto', '再起動時点で終了予定時刻を過ぎていたため計測を止めました。');
      continue;
    }
    // 単一プロセス前提なので、残っている measure_owner は前のプロセスの残骸として奪う
    await execute('UPDATE liveops_programs SET measure_owner = $2 WHERE id = $1', [row.id, INSTANCE_ID]);
    const intervalSec = await loadOrgPollingIntervalSec();
    scheduleTick(row.id, intervalSec);
  }
}

/** 今日（太平洋時間）の YouTube 消費ユニット合計。YouTube のリセットが太平洋時間 0:00 のため。 */
export async function getTodayYoutubeUnits(): Promise<number> {
  const row = await queryOne(
    `SELECT COALESCE(SUM(units), 0) AS used
       FROM liveops_poll_log
      WHERE platform = 'youtube'
        AND at >= date_trunc('day', NOW() AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/Los_Angeles'`,
    [],
  );
  return Number((row as any)?.used ?? 0);
}
