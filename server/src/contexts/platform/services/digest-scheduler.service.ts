/**
 * 朝の1通の定時送信 (ics-sync / interactive-poller と同型の in-process poller)
 *
 * 専用の cron 基盤は持っていないので、1分ごとに「送る時刻を過ぎていて、まだ今日その回を
 * 送っていない配信」を探して送る。二重送信は `last_sent_at` で防ぐ。
 *
 * **遅れて上がってきたときの取り扱いを決めてある**: 予定時刻から 60分 を過ぎていたら送らない。
 * 6:00 の投稿が 23:00 に届くほうが、届かないより困る (朝の情報として嘘になる)。
 * 送れなかったことは last_error に残す。
 *
 * トークン未設定なら**何もしない** (機能ごと無効)。
 */
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { buildDigestText, buildPersonalDigests } from './digest.service';
import { isSlackConfigured, postMessage, findUserByEmail } from './slack.service';

const TICK_MS = 60_000;
/** 予定時刻からこれ以上遅れたら送らない (朝の情報として嘘になるため) */
const CATCH_UP_MS = 60 * 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export interface DigestRow {
  id: string; channel: string; send_time: string; weekdays: string;
  blocks: unknown; last_sent_at: string | Date | null;
}

/** その日の予定時刻 (サーバーのローカル時刻 = JST 運用) */
function scheduledAt(now: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d;
}

/** ISO の曜日 (1=月 … 7=日) */
function isoDow(d: Date): number {
  const g = d.getDay();
  return g === 0 ? 7 : g;
}

/**
 * この配信を「いま送るべきか」。**単体で確かめられるように切り出してある**
 * (曜日・時刻・遅れすぎ・送り済み の4条件が絡むので、目視では間違える)。
 */
export function dueNow(row: DigestRow, now: Date): boolean {
  if (!row.weekdays.split(',').map(Number).includes(isoDow(now))) return false;
  const due = scheduledAt(now, row.send_time);
  if (now < due) return false;                                  // まだ時刻前
  if (now.getTime() - due.getTime() > CATCH_UP_MS) return false; // 遅れすぎ → 送らない
  const last = row.last_sent_at ? new Date(row.last_sent_at).getTime() : 0;
  return last < due.getTime();                                  // その回をまだ送っていない
}

async function tick(): Promise<void> {
  if (running || !isSlackConfigured()) return;
  running = true;
  try {
    const rows = await queryAll(
      `SELECT id, channel, send_time, weekdays, blocks, last_sent_at
       FROM slack_digests WHERE deleted_at IS NULL AND enabled = TRUE`,
    ) as unknown as DigestRow[];
    const now = new Date();
    for (const row of rows) {
      try {
        if (!dueNow(row, now)) continue;
        const blocks = Array.isArray(row.blocks) ? (row.blocks as string[]) : [];
        const text = await buildDigestText(blocks);
        await postMessage(row.channel, text);
        await execute(
          `UPDATE slack_digests SET last_sent_at = NOW(), last_error = NULL WHERE id = ?`, [row.id],
        );
        console.log(`[digest] sent ${row.channel} (${row.send_time})`);
      } catch (err) {
        const message = (err as Error).message;
        console.warn(`[digest] send failed (${row.channel}):`, message);
        // 失敗しても業務は止めない。原因は画面で読めるように残す
        await execute(
          `UPDATE slack_digests SET last_sent_at = NOW(), last_error = ? WHERE id = ?`,
          [message.slice(0, 500), row.id],
        ).catch(() => { /* ここで落ちても poller は続ける */ });
      }
    }
    await tickPersonalDm(now);
  } catch (err) {
    console.warn('[digest] tick failed:', (err as Error).message);
  } finally {
    running = false;
  }
}

/**
 * 個人への DM。**出すものが無い人には送らない** (buildPersonalDigests が空を返す)。
 * 誰か1人の送信が失敗しても他の人には送る (1人の Slack 未参加で全員止めない)。
 */
async function tickPersonalDm(now: Date): Promise<void> {
  const row = await queryOne(
    `SELECT send_time, weekdays, enabled, last_sent_at FROM slack_dm_settings WHERE id = TRUE`,
  ) as { send_time: string; weekdays: string; enabled: boolean; last_sent_at: string | Date | null } | null;
  if (!row || !row.enabled) return;
  if (!dueNow({ id: 'dm', channel: 'dm', ...row, blocks: [] }, now)) return;

  const digests = await buildPersonalDigests();
  let sent = 0;
  const failed: string[] = [];
  for (const d of digests) {
    try {
      const slackId = await findUserByEmail(d.email);
      if (!slackId) { failed.push(`${d.email}: Slack に見つかりません`); continue; }
      await postMessage(slackId, d.text);
      sent++;
    } catch (err) {
      failed.push(`${d.email}: ${(err as Error).message}`);
    }
  }
  await execute(
    `UPDATE slack_dm_settings SET last_sent_at = NOW(), last_error = ? WHERE id = TRUE`,
    [failed.length > 0 ? failed.join(' / ').slice(0, 500) : null],
  );
  console.log(`[digest] DM sent ${sent}/${digests.length}${failed.length ? ` (失敗 ${failed.length})` : ''}`);
}

export function initDigestScheduler(): void {
  if (timer) return;
  if (!isSlackConfigured()) {
    console.log('[digest] SLACK_BOT_TOKEN 未設定のため朝の1通は無効です');
    return;
  }
  timer = setInterval(() => { void tick(); }, TICK_MS);
  console.log('[digest] scheduler started (1分ごと)');
}

export function shutdownDigestScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
