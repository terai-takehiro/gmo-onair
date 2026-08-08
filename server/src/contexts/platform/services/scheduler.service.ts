/**
 * 定時実行 — v4 設定 ⑦
 *
 * ── 二重に送らないこと が最優先 ────────────────────────────
 *
 * コンテナは**デプロイのたびに再起動します**。素直に「起動したら流す」と
 * 書くと、1日に何度もデプロイした日は督促が何度も出ます。2 段で守ります:
 *
 *   1. `scheduled_job_runs(job_key, run_date)` … その日その仕事を始めたら行を作る。
 *      主キーなので**2 つ目の起動は行を作れず、そこで止まります**
 *   2. `notifications` の一意索引 … 1 をすり抜けても、同じ人・同じ対象・同じ日は
 *      1 行しか入りません（記録を書く前に落ちた回・複数プロセスの回に効く）
 *
 * ── 時刻の持ち方 ────────────────────────────────────────────
 *
 * 15 分ごとに起きて「今日まだ流していない ＆ 予定の時刻を過ぎた」仕事を流します。
 * **時刻ちょうどに起きるのを狙いません** — 起きられなかった回（再起動中など）が
 * その日ぶんまるごと飛ぶためです。過ぎていれば流す形なら遅れても届きます。
 *
 * ── 送るのは社内通知だけ ────────────────────────────────────
 *
 * ご判断により**社外メールは送りません**。社外の 2 本（利用前日のご案内・
 * 請求書の送付）は「送る時期が来ました」を社内のベルに出すだけにします。
 */
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { notifyMany, usersWithPermission, fill, type NotifyInput } from './notification.service';

/** サーバーの時計から `YYYY-MM-DD` と `HH:MM`。**時差を持ち込まない** */
function nowParts(): { date: string; time: string } {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}`,
  };
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
}

interface Job {
  key: string;
  /** この時刻を過ぎたら流す（`HH:MM`） */
  at: string;
  /** ひな形の id。無効にされていたら流さない */
  templateId: string;
  run: (today: string) => Promise<NotifyInput[]>;
}

// ───────────────────────────────────────────────────────────
// 仕事の中身
// ───────────────────────────────────────────────────────────

/** 入金遅れの督促 → 経理と、その売上を作った人 */
async function overdueInvoices(today: string): Promise<NotifyInput[]> {
  const rows = await queryAll(
    `SELECT r.id, r.payment_due_date, r.amount, r.created_by, c.name AS customer_name, r.invoice_no
       FROM revenues r
       LEFT JOIN customers c ON c.id = r.customer_id
      WHERE r.deleted_at IS NULL AND r.status = 'confirmed'
        AND r.paid_date IS NULL
        AND r.payment_due_date IS NOT NULL
        AND substr(r.payment_due_date, 1, 10) < ?`,
    [today],
  );
  if (rows.length === 0) return [];

  const keiri = await usersWithPermission('budget', 'editor');
  const out: NotifyInput[] = [];
  for (const r of rows) {
    const due = String(r.payment_due_date).slice(0, 10);
    const late = Math.max(0, Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86400000));
    const vars = {
      '取引先名': String(r.customer_name ?? '（お客様名なし）'),
      '請求番号': String(r.invoice_no ?? '—'),
      '請求金額': `¥${Number(r.amount ?? 0).toLocaleString('ja-JP')}`,
      '支払期限': due.replace(/-/g, '/'),
      '遅延日数': late,
    };
    // 経理 ＋ その売上を作った人（重なっても一意索引で1行になる）
    const to = new Set(keiri);
    if (r.created_by) to.add(String(r.created_by));
    for (const u of to) {
      out.push({
        userId: u, templateId: 'inv_late',
        title: fill('［未入金］{取引先名} {請求番号}', vars),
        body: fill('期限 {支払期限}（{遅延日数} 日超過）・{請求金額}', vars),
        link: '/budget/billing', refType: 'revenue', refId: String(r.id), refDate: today,
      });
    }
  }
  return out;
}

/** タスクの期限前通知（2日前）→ 担当者 */
async function tasksDueSoon(today: string): Promise<NotifyInput[]> {
  const target = shiftDate(today, 2);
  // **`status` 列は無い。** 済んだかは `is_completed`。
  // **`due_date` は `date` 型**（ほかの表は TEXT なので `substr` で切っているが、
  // ここでやると `function substr(date, ...) does not exist` で落ちる）。
  // 型チェックは SQL の中身を見ないので、実 DB に流して初めて分かった。
  const rows = await queryAll(
    `SELECT t.id, t.title, t.due_date, t.assigned_to, p.name AS project_name
       FROM project_tasks t
       LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.deleted_at IS NULL AND t.is_completed IS NOT TRUE
        AND t.assigned_to IS NOT NULL
        AND t.due_date = ?::date`,
    [target],
  );
  return rows.map((t) => {
    const vars = {
      'タスク名': String(t.title ?? ''),
      '期限日': target.replace(/-/g, '/'),
      '案件名': String(t.project_name ?? '（案件なし）'),
    };
    return {
      userId: String(t.assigned_to), templateId: 'tk_due',
      title: fill('［まもなく期限］{タスク名}', vars),
      body: fill('期限 {期限日} ・ 案件：{案件名}', vars),
      link: '/sales/tasks/list', refType: 'task', refId: String(t.id), refDate: today,
    };
  });
}

/** 機材の返却遅れ → 機材を直せる人と借用者 */
async function equipmentOverdue(today: string): Promise<NotifyInput[]> {
  // **`borrower_user_id` は無い。** 借用者は氏名の文字列で持っており、
  // 利用者の id と結び付いていない。通知を出せるのは**貸し出した人**（`lent_by`）
  // なので、そこへ出す（借用者本人へは届けられないことを画面に書く）
  const rows = await queryAll(
    `SELECT l.id, l.due_date, l.lent_by, l.borrower_name, e.name AS equipment_name
       FROM equipment_lendings l
       LEFT JOIN equipment_items e ON e.id = l.equipment_id
      WHERE l.status = 'lent' AND l.due_date IS NOT NULL
        AND substr(l.due_date, 1, 10) < ?`,
    [today],
  );
  if (rows.length === 0) return [];
  const tech = await usersWithPermission('equipment', 'editor');
  const out: NotifyInput[] = [];
  for (const l of rows) {
    const vars = {
      '機材名': String(l.equipment_name ?? '貸出中の機材'),
      '借用者名': String(l.borrower_name ?? '—'),
      '返却予定日': String(l.due_date).slice(0, 10).replace(/-/g, '/'),
    };
    const to = new Set(tech);
    if (l.lent_by) to.add(String(l.lent_by));
    for (const u of to) {
      out.push({
        userId: u, templateId: 'eq_return',
        title: fill('［未返却］{機材名}', vars),
        body: fill('借用者：{借用者名} ／ 返却予定日 {返却予定日} を過ぎています', vars),
        link: '/equipment/lendings', refType: 'lending', refId: String(l.id), refDate: today,
      });
    }
  }
  return out;
}

/**
 * 明日の予約 → 案件の担当者に「前日案内をまだ送っていません」
 *
 * **メールは送りません**（ご判断）。送る時期が来たことだけ知らせます。
 */
async function bookingRemindTodo(today: string): Promise<NotifyInput[]> {
  const tomorrow = shiftDate(today, 1);
  const rows = await queryAll(
    `SELECT b.id, b.title, b.start_time, b.created_by, p.name AS project_name
       FROM studio_bookings b
       LEFT JOIN projects p ON p.id = b.project_id
      WHERE b.deleted_at IS NULL AND b.status = 'confirmed'
        AND substr(b.start_time, 1, 10) = ?`,
    [tomorrow],
  );
  return rows.filter((b) => b.created_by).map((b) => {
    const vars = {
      '案件名': String(b.project_name ?? b.title ?? ''),
      '利用日': tomorrow.replace(/-/g, '/'),
    };
    return {
      userId: String(b.created_by), templateId: 'bk_remind_todo',
      title: fill('［明日ご利用］{案件名} の前日案内をまだ送っていません', vars),
      body: fill('明日 {利用日} にご利用の予約があります。「利用前日のご連絡」の文面をコピーして送ってください。', vars),
      link: '/studio/calendar', refType: 'booking', refId: String(b.id), refDate: today,
    };
  });
}

/** 請求書をまだ出していないもの → 経理に「出す時期が来ました」 */
async function invoiceSendTodo(today: string): Promise<NotifyInput[]> {
  const rows = await queryAll(
    `SELECT r.id, r.amount, r.payment_due_date, c.name AS customer_name
       FROM revenues r
       LEFT JOIN customers c ON c.id = r.customer_id
      WHERE r.deleted_at IS NULL AND r.status = 'confirmed'
        AND r.invoice_issued IS NOT TRUE
        AND r.billing_date IS NOT NULL
        AND substr(r.billing_date, 1, 10) <= ?`,
    [today],
  );
  if (rows.length === 0) return [];
  const keiri = await usersWithPermission('budget', 'editor');
  const out: NotifyInput[] = [];
  for (const r of rows) {
    const vars = {
      '取引先名': String(r.customer_name ?? '（お客様名なし）'),
      '請求金額': `¥${Number(r.amount ?? 0).toLocaleString('ja-JP')}`,
      '支払期限': String(r.payment_due_date ?? '').slice(0, 10).replace(/-/g, '/') || '未設定',
    };
    for (const u of keiri) {
      out.push({
        userId: u, templateId: 'inv_send_todo',
        title: fill('［請求書］{取引先名} 宛の請求書をまだ出していません', vars),
        body: fill('{請求金額} ・ 支払期限 {支払期限}', vars),
        link: '/budget/billing', refType: 'revenue', refId: String(r.id), refDate: today,
      });
    }
  }
  return out;
}

const JOBS: Job[] = [
  { key: 'tk_due', at: '09:00', templateId: 'tk_due', run: tasksDueSoon },
  { key: 'inv_late', at: '09:00', templateId: 'inv_late', run: overdueInvoices },
  { key: 'eq_return', at: '09:00', templateId: 'eq_return', run: equipmentOverdue },
  { key: 'inv_send_todo', at: '09:30', templateId: 'inv_send_todo', run: invoiceSendTodo },
  { key: 'bk_remind_todo', at: '17:00', templateId: 'bk_remind_todo', run: bookingRemindTodo },
];

/**
 * 1回ぶん流す。**テストから直接呼べるように export する。**
 * @param force 時刻を無視して流す（画面の「いま流す」用）
 */
export async function runDueJobs(force = false): Promise<{ key: string; created: number }[]> {
  const { date, time } = nowParts();
  const done: { key: string; created: number }[] = [];

  for (const job of JOBS) {
    if (!force && time < job.at) continue;

    // ひな形が無効にされていたら流さない（設定の画面で止められる）
    const tpl = await queryOne(
      'SELECT enabled FROM notification_templates WHERE id = ?', [job.templateId],
    ) as { enabled?: boolean } | null;
    if (!tpl?.enabled) continue;

    // **その日その仕事を始めたら行を作る。** 主キーなので2つ目は入らず、
    // ここで弾かれる（再起動しても二重に流れない）
    const claimed = await queryOne(
      `INSERT INTO scheduled_job_runs (job_key, run_date) VALUES (?, ?)
       ON CONFLICT (job_key, run_date) DO NOTHING RETURNING job_key`,
      [job.key, date],
    ) as { job_key?: string } | null;
    if (!claimed?.job_key && !force) continue;

    try {
      const created = await notifyMany(await job.run(date));
      await execute(
        // **足し込む。** `= ?` にすると、画面から流し直したとき
        // 「新しく出たのは 0 件」で上書きされ、その日の実績が消える
        `UPDATE scheduled_job_runs SET finished_at = NOW(), created = created + ?, error = NULL
          WHERE job_key = ? AND run_date = ?`,
        [created, job.key, date],
      );
      done.push({ key: job.key, created });
    } catch (e) {
      // **失敗しても他の仕事は流す。** 1本のせいで全部が止まると、
      // 止まっていることに誰も気づけない
      await execute(
        `UPDATE scheduled_job_runs SET finished_at = NOW(), error = ? WHERE job_key = ? AND run_date = ?`,
        [String((e as Error).message).slice(0, 500), job.key, date],
      );
      console.error(`[scheduler] ${job.key} failed:`, (e as Error).message);
    }
  }
  return done;
}

let timer: NodeJS.Timeout | null = null;

/**
 * 15 分ごとに起こす。**時刻ちょうどを狙わない** —
 * 起きられなかった回（再起動中など）がその日ぶんまるごと飛ぶため、
 * 「過ぎていれば流す」形にしてある。
 */
export function startScheduler(): void {
  if (timer) return;
  const tick = () => { void runDueJobs().catch((e) => console.error('[scheduler]', e)); };
  timer = setInterval(tick, 15 * 60 * 1000);
  // 起動直後にも1回。**その日ぶんの記録があれば何もしない**ので安全
  setTimeout(tick, 30_000);
}

export function stopScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

export const SCHEDULER_JOBS = JOBS.map((j) => ({ key: j.key, at: j.at, templateId: j.templateId }));
