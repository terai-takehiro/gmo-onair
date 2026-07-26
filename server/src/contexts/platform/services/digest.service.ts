/**
 * 朝の1通の本文を組む (§4.15 / §2.5)
 *
 * 書き方の決めごと:
 *   - 1行1情報。社内語と技術用語は出さない (「AI起票」ではなく「AIが作って、まだ人が見ていないもの」)
 *   - 数字で書く。「多数あります」は書かない
 *   - 最後に次にやることを1つだけ書く
 *   - **中身が0件のブロックは行ごと出さない** (空の見出しが並ぶと本文が読み飛ばされる)
 *
 * データは**すべて既存のテーブルからその場で読む**。通知用のテーブルは作らない
 * (作ると「消し忘れた通知が残る」が原理的に起きる)。
 */
import { queryAll, queryOne } from '../../../shared/db/connection';
import { config } from '../../../config';

export interface DigestBlockDef {
  key: string;
  label: string;
  hint: string;
  /** 金額が出るブロック。画面で赤く注意を出す (権限の外に出るため) */
  money?: boolean;
}

/** 画面のメニューと本文の組み立てで**同じ定義**を使う (片方だけ増えるのを防ぐ) */
export const DIGEST_BLOCKS: DigestBlockDef[] = [
  { key: 'onsite_today', label: '今日と明日の現場', hint: 'スタジオの予約から。部屋・時刻・案件名' },
  { key: 'waiting', label: 'お客様を待たせているもの', hint: '件数と、いちばん古い待ち時間と、内訳' },
  { key: 'due_today', label: '今日が期限のタスク', hint: '全社の件数' },
  { key: 'week_ahead', label: '今週の予定', hint: '本番・リハーサル・仮押さえの件数' },
  { key: 'no_next_action', label: '次にやることが決まっていない案件', hint: '進行中なのに次の一手が空の案件の件数' },
  { key: 'holds_soon', label: '期限が近い仮押さえ', hint: '本番日が近いのにまだ仮押さえのままのもの' },
  { key: 'equipment_overdue', label: '機材の返却遅延', hint: '返却予定日を過ぎている点数' },
  { key: 'inview_today', label: '今日の内覧会', hint: '来場予約の組数と人数' },
  { key: 'done_last7', label: '直近7日で終わらせた件数', hint: '全社で終わったタスクと次回アクション' },
  { key: 'money_month', label: '今月の数字（金額）', hint: '確定売上・粗利・営業利益', money: true },
];

const WD = ['日', '月', '火', '水', '木', '金', '土'];
const n = (v: unknown): number => Number(v ?? 0);
const yen = (v: unknown): string => `${Math.round(n(v)).toLocaleString()}円`;

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** 'HH:MM' だけを取り出す (start_time は TEXT の ISO 文字列) */
function hhmm(iso: unknown): string {
  const m = String(iso ?? '').match(/T(\d{2}:\d{2})/);
  return m ? m[1] : '';
}

const BOOKING_LABEL: Record<string, string> = {
  performance: '本番', rehearsal: 'リハーサル', hold: '仮押さえ', tour: '内覧',
  meeting: '相談', setup: '設営・準備', maintenance: 'メンテナンス', internal: '社内利用', other: 'その他',
};

// ── 各ブロック。null / '' を返したらそのブロックは本文に出さない ────────────

async function onsiteToday(): Promise<string | null> {
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const t0 = dateStr(today);
  const t1 = dateStr(tomorrow);
  const rows = await queryAll(
    `SELECT b.title, b.booking_type, b.start_time, b.end_time, b.all_day,
            p.name AS project_name,
            COALESCE((SELECT string_agg(r.name, ' / ' ORDER BY r.sort_order, r.name)
                      FROM studio_booking_rooms br JOIN studio_rooms r ON r.id = br.room_id
                      WHERE br.booking_id = b.id), '') AS room_names,
            COALESCE((SELECT string_agg(DISTINCT l.name, ' / ')
                      FROM studio_booking_rooms br JOIN studio_rooms r ON r.id = br.room_id
                      JOIN studio_locations l ON l.id = r.location_id
                      WHERE br.booking_id = b.id), '') AS location_names,
            substr(b.start_time, 1, 10) AS d
     FROM studio_bookings b
     LEFT JOIN projects p ON p.id = b.project_id
     WHERE b.deleted_at IS NULL
       AND substr(b.start_time, 1, 10) <= ?
       AND substr(COALESCE(NULLIF(b.end_time,''), b.start_time), 1, 10) >= ?
     ORDER BY b.start_time
     LIMIT 40`,
    [t1, t0],
  );
  const todays = rows.filter((r) => String(r.d) === t0);
  const tomorrows = rows.filter((r) => String(r.d) === t1);
  if (todays.length === 0 && tomorrows.length === 0) return null;

  const lines = ['■ 今日と明日の現場'];
  if (todays.length === 0) lines.push('今日の現場はありません。');
  for (const r of todays) {
    const place = [r.location_names, r.room_names].filter(Boolean).join(' ');
    const time = r.all_day ? '終日' : [hhmm(r.start_time), hhmm(r.end_time)].filter(Boolean).join('-');
    const what = BOOKING_LABEL[String(r.booking_type)] ?? String(r.booking_type);
    const name = String(r.project_name || r.title || '');
    lines.push(`・${place} ${time} ${what}${name ? `「${name}」` : ''}`.replace(/\s+/g, ' ').trim());
  }
  if (tomorrows.length > 0) {
    const byType = new Map<string, number>();
    for (const r of tomorrows) {
      const k = BOOKING_LABEL[String(r.booking_type)] ?? String(r.booking_type);
      byType.set(k, (byType.get(k) ?? 0) + 1);
    }
    const detail = Array.from(byType, ([k, v]) => `${k}${v}`).join('・');
    lines.push(`明日は ${tomorrows.length}件（${detail}）`);
  }
  return lines.join('\n');
}

async function waiting(): Promise<string | null> {
  const [overdue, ai, iq, fd] = await Promise.all([
    queryOne(
      `SELECT COUNT(*) AS c, MIN(a.next_action_date) AS oldest
       FROM activity_logs a JOIN projects p ON p.id = a.project_id
       WHERE a.deleted_at IS NULL AND p.deleted_at IS NULL
         AND p.stage NOT IN ('s_completed','e_lost')
         AND a.next_action IS NOT NULL AND a.next_action_date IS NOT NULL
         AND a.next_action_done_at IS NULL AND a.next_action_date < CURRENT_DATE::text`,
    ),
    queryOne(
      `SELECT COUNT(*) AS c FROM projects p
       LEFT JOIN LATERAL (
         SELECT m.id FROM mcp_audit_log m
         WHERE m.tool_name = 'create_project' AND m.result_summary->>'created_id' = p.id LIMIT 1
       ) ai ON TRUE
       WHERE p.deleted_at IS NULL AND p.ai_reviewed_at IS NULL
         AND (p.created_by = ? OR ai.id IS NOT NULL)`,
      [config.mcpActorId],
    ),
    queryOne(`SELECT COUNT(*) AS c FROM misc_inquiries WHERE deleted_at IS NULL AND handled_at IS NULL`),
    queryOne(`SELECT COUNT(*) AS c FROM finance_docs WHERE deleted_at IS NULL AND status NOT IN ('processed','rejected')`),
  ]);
  const parts: string[] = [];
  if (n(overdue?.c) > 0) parts.push(`・返事の期限が過ぎたもの ${n(overdue?.c)}件`);
  if (n(ai?.c) > 0) parts.push(`・AIが作って、まだ人が見ていないもの ${n(ai?.c)}件`);
  if (n(iq?.c) > 0) parts.push(`・届いた問い合わせ ${n(iq?.c)}件`);
  if (n(fd?.c) > 0) parts.push(`・見積・請求の確認 ${n(fd?.c)}件`);
  const total = n(overdue?.c) + n(ai?.c) + n(iq?.c) + n(fd?.c);
  if (total === 0) return '■ お客様を待たせているもの\nありません。この状態を保てています。';

  const lines = [`■ お客様を待たせているもの ${total}件`];
  if (overdue?.oldest) {
    const days = Math.max(0, Math.floor((Date.now() - new Date(`${String(overdue.oldest)}T00:00:00`).getTime()) / 86_400_000));
    if (days > 0) lines.push(`いちばん古いものは ${days}日 待っています。`);
  }
  lines.push(...parts);
  return lines.join('\n');
}

async function dueToday(): Promise<string | null> {
  // 期限は due_at を正とし、旧 due_date はその日の 18:00 として読む (v2.9.244 の決めごと)
  const r = await queryOne(
    `SELECT COUNT(*) AS c FROM project_tasks
     WHERE deleted_at IS NULL AND completed_at IS NULL
       AND COALESCE(due_at, (due_date::timestamp + interval '18 hours'))::date = CURRENT_DATE`,
  );
  if (n(r?.c) === 0) return null;
  return `■ 今日が期限のタスク ${n(r?.c)}件`;
}

async function weekAhead(): Promise<string | null> {
  const today = new Date();
  const from = dateStr(today);
  const to = dateStr(new Date(today.getTime() + 6 * 86_400_000));
  const rows = await queryAll(
    `SELECT b.booking_type, COUNT(*) AS c FROM studio_bookings b
     WHERE b.deleted_at IS NULL
       AND substr(b.start_time, 1, 10) BETWEEN ? AND ?
     GROUP BY b.booking_type ORDER BY 2 DESC`,
    [from, to],
  );
  if (rows.length === 0) return null;
  const detail = rows.map((r) => `${BOOKING_LABEL[String(r.booking_type)] ?? String(r.booking_type)} ${n(r.c)}件`).join(' / ');
  return `■ これから7日の予定\n${detail}`;
}

async function noNextAction(): Promise<string | null> {
  const r = await queryOne(
    `SELECT COUNT(*) AS c FROM projects p
     WHERE p.deleted_at IS NULL
       AND p.stage NOT IN ('neta','s_completed','e_lost')
       AND NOT EXISTS (
         SELECT 1 FROM activity_logs a
         WHERE a.project_id = p.id AND a.deleted_at IS NULL
           AND a.next_action IS NOT NULL AND a.next_action_done_at IS NULL
       )`,
  );
  if (n(r?.c) === 0) return null;
  return `■ 次にやることが決まっていない案件 ${n(r?.c)}件\n進んでいるはずの案件で、次の一手が空のままです。`;
}

async function holdsSoon(): Promise<string | null> {
  const today = dateStr(new Date());
  const until = dateStr(new Date(Date.now() + 45 * 86_400_000));
  const rows = await queryAll(
    `SELECT substr(b.start_time,1,10) AS d, p.name AS project_name, b.title
     FROM studio_bookings b LEFT JOIN projects p ON p.id = b.project_id
     WHERE b.deleted_at IS NULL AND b.booking_type = 'hold'
       AND substr(b.start_time,1,10) BETWEEN ? AND ?
     ORDER BY b.start_time LIMIT 5`,
    [today, until],
  );
  if (rows.length === 0) return null;
  const lines = [`■ 期限が近い仮押さえ ${rows.length}件`, '本予約に切り替えないと、他社に取られることがあります。'];
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
  for (const r of rows) {
    // 日付どうしの差で数える (いまの時刻で1日ずれるのを防ぐ)
    const days = Math.max(0, Math.round((new Date(`${String(r.d)}T00:00:00`).getTime() - todayMidnight.getTime()) / 86_400_000));
    lines.push(`・${String(r.project_name || r.title || '（名前なし）')}（あと${days}日）`);
  }
  return lines.join('\n');
}

async function equipmentOverdue(): Promise<string | null> {
  // 機材の貸出は status='lent' / 返却予定は due_date (equipment/stats と同じ条件)
  const r = await queryOne(
    `SELECT COUNT(*) AS c FROM equipment_lendings
     WHERE status = 'lent' AND due_date IS NOT NULL AND due_date < CURRENT_DATE::text`,
  ).catch(() => null);
  if (!r || n(r.c) === 0) return null;
  return `■ 機材の返却遅延 ${n(r.c)}件`;
}

async function inviewToday(): Promise<string | null> {
  const today = dateStr(new Date());
  const r = await queryOne(
    `SELECT COUNT(*) AS groups, COALESCE(SUM(GREATEST(party_size, 1)), 0) AS people
     FROM inview_registrations
     WHERE deleted_at IS NULL AND session_date = ?`,
    [today],
  ).catch(() => null);
  if (!r || n(r.groups) === 0) return null;
  return `■ 今日の内覧会 ${n(r.groups)}組 ${n(r.people)}名`;
}

async function doneLast7(): Promise<string | null> {
  const r = await queryOne(
    `SELECT
       (SELECT COUNT(*) FROM project_tasks
         WHERE deleted_at IS NULL AND completed_at IS NOT NULL
           AND completed_at >= NOW() - interval '7 days') AS tasks,
       (SELECT COUNT(*) FROM activity_logs
         WHERE deleted_at IS NULL AND next_action_done_at IS NOT NULL
           AND next_action_done_at >= NOW() - interval '7 days') AS actions`,
  );
  const total = n(r?.tasks) + n(r?.actions);
  if (total === 0) return null;
  return `■ 直近7日で終わらせたこと ${total}件`;
}

async function moneyMonth(): Promise<string | null> {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const to = dateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const [rev, pur, sga] = await Promise.all([
    queryOne(`SELECT COALESCE(SUM(amount),0) AS t FROM revenues
              WHERE deleted_at IS NULL AND status = 'confirmed' AND recognition_date BETWEEN ? AND ?`, [from, to]),
    queryOne(`SELECT COALESCE(SUM(amount),0) AS t FROM purchases
              WHERE deleted_at IS NULL AND recognition_date BETWEEN ? AND ?`, [from, to]),
    queryOne(`SELECT COALESCE(SUM(amount),0) AS t FROM sga_expenses
              WHERE deleted_at IS NULL AND recognition_date BETWEEN ? AND ?`, [from, to]),
  ]);
  const r = n(rev?.t); const p = n(pur?.t); const s = n(sga?.t);
  if (r === 0 && p === 0 && s === 0) return null;
  return [
    `■ 今月の数字（${now.getMonth() + 1}月・税抜）`,
    `確定した売上 ${yen(r)}`,
    `仕入 ${yen(p)} ／ 販管費 ${yen(s)}`,
    `営業利益 ${yen(r - p - s)}`,
  ].join('\n');
}

const BUILDERS: Record<string, () => Promise<string | null>> = {
  onsite_today: onsiteToday,
  waiting,
  due_today: dueToday,
  week_ahead: weekAhead,
  no_next_action: noNextAction,
  holds_soon: holdsSoon,
  equipment_overdue: equipmentOverdue,
  inview_today: inviewToday,
  done_last7: doneLast7,
  money_month: moneyMonth,
};

/**
 * 本文を組む。**ブロックの1つが失敗しても本文全体は出す**
 * (1つのクエリが落ちて朝の1通が丸ごと止まるほうが困る)。
 */
export async function buildDigestText(
  blockKeys: string[],
  opts: { baseUrl?: string } = {},
): Promise<string> {
  const now = new Date();
  const head = `おはようございます。${now.getMonth() + 1}月${now.getDate()}日(${WD[now.getDay()]}) のONAiRです。`;
  const parts: string[] = [];
  for (const key of blockKeys) {
    const build = BUILDERS[key];
    if (!build) continue;
    try {
      const text = await build();
      if (text) parts.push(text);
    } catch (err) {
      console.warn(`[digest] block ${key} failed:`, (err as Error).message);
    }
  }
  if (parts.length === 0) {
    parts.push('今日、共有することはありません。');
  }
  const base = opts.baseUrl || process.env.CLIENT_URL || '';
  const foot = base
    ? `心当たりのある人は「今日」の画面を開いてください。\n→ ${base.replace(/\/$/, '')}/today`
    : '心当たりのある人は「今日」の画面を開いてください。';
  return [head, '', parts.join('\n\n'), '', foot].join('\n');
}

// ── 個人への DM (自分の分だけ) ─────────────────────────────────
//
// グループ投稿と**中身を分けてある**。個人 DM に全社の話を混ぜると読み飛ばされ、
// グループに個人の ToDo を流すと自分の行を探す作業になる。
// ここに出すのは「あなたが動くもの」だけ。

export interface PersonalDigest { userId: string; email: string; name: string; text: string }

/**
 * 朝の DM を受け取る人と本文。
 * `morning_slack` が ON の人だけ (行が無い人は既定 ON = migration 137 の DEFAULT に合わせる)。
 * **出すものが1つも無い人は返さない** (「今日は何もありません」を毎朝送らない)。
 */
export async function buildPersonalDigests(baseUrl?: string): Promise<PersonalDigest[]> {
  const users = await queryAll(
    `SELECT u.id, u.name, u.email
     FROM users u
     LEFT JOIN user_notification_prefs p ON p.user_id = u.id
     WHERE u.deleted_at IS NULL AND u.email IS NOT NULL AND u.email <> ''
       AND COALESCE(p.morning_slack, TRUE) = TRUE`,
  );
  const base = (baseUrl || process.env.CLIENT_URL || '').replace(/\/$/, '');
  const out: PersonalDigest[] = [];
  for (const u of users) {
    const uid = String(u.id);
    const r = await queryOne(
      `SELECT
         (SELECT COUNT(*) FROM project_tasks t
           WHERE t.deleted_at IS NULL AND t.completed_at IS NULL AND t.assigned_to = ?
             AND COALESCE(t.due_at, (t.due_date::timestamp + interval '18 hours')) < NOW()) AS overdue,
         (SELECT COUNT(*) FROM project_tasks t
           WHERE t.deleted_at IS NULL AND t.completed_at IS NULL AND t.assigned_to = ?
             AND COALESCE(t.due_at, (t.due_date::timestamp + interval '18 hours'))::date = CURRENT_DATE) AS today,
         (SELECT COUNT(*) FROM project_tasks t
           WHERE t.deleted_at IS NULL AND t.completed_at IS NULL AND t.assigned_to = ?
             AND t.requester_id IS NOT NULL AND t.accepted_at IS NULL) AS unanswered,
         (SELECT COUNT(*) FROM activity_logs a
           WHERE a.deleted_at IS NULL AND a.user_id = ? AND a.next_action IS NOT NULL
             AND a.next_action_done_at IS NULL AND a.next_action_date < CURRENT_DATE::text) AS actions`,
      [uid, uid, uid, uid],
    ) as Record<string, unknown> | null;
    const lines: string[] = [];
    if (n(r?.actions) > 0) lines.push(`・お客様への返事の期限が過ぎたもの ${n(r?.actions)}件`);
    if (n(r?.overdue) > 0) lines.push(`・期限が過ぎたタスク ${n(r?.overdue)}件`);
    if (n(r?.today) > 0) lines.push(`・今日が期限のタスク ${n(r?.today)}件`);
    if (n(r?.unanswered) > 0) lines.push(`・まだ返事をしていない依頼 ${n(r?.unanswered)}件`);
    if (lines.length === 0) continue; // 何も無い人には送らない
    const text = [
      `おはようございます、${String(u.name ?? '')}さん。`,
      '',
      ...lines,
      '',
      base ? `→ ${base}/today` : '「今日」の画面を開いてください。',
    ].join('\n');
    out.push({ userId: uid, email: String(u.email), name: String(u.name ?? ''), text });
  }
  return out;
}
