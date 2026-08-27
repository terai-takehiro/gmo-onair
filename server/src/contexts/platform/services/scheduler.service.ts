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
import { generateKptDraft } from '../../sales/services/kpt.service';
import { isKptAiConfigured } from '../../sales/services/kpt-ai.service';
import { runFormatPass } from '../../sales/services/activity-format.service';
import { runShortPass } from '../../sales/services/next-action-short.service';
import { jstParts, shiftYmd } from '../../../shared/utils/jst';
import {
  listTidyCandidates, autoLoseStaleNeta, completeElapsedWonProjects,
  TIDY_CANDIDATE_DAYS, TIDY_AUTO_LOST_DAYS,
} from '../../sales/services/project-health';
import { expireOpenProposals, settleDueProposals } from '../../qsheet/ai/settle.service';
import { runMonthlyReviewIfDue, AI_REVIEW_JOB_KEY, AI_REVIEW_NOTIFY_TEMPLATE_ID } from '../../qsheet/ai/monthly-review.service';

/**
 * いまの `YYYY-MM-DD` と `HH:MM`。**日本の壁時計**で返す。
 *
 * ⚠️ 以前はここで `new Date().getHours()` を使っていた。コンテナは **UTC で動く**ので、
 * **`at: '09:00'` の仕事が JST 18:00 に、3時の夜間整形が正午に走っていた**
 * （`jst.ts` に理由を書いてある。`TZ` を渡しても Alpine は tzdata を持たないので効かない）。
 */
function nowParts(): { date: string; time: string } {
  return jstParts();
}

const shiftDate = shiftYmd;

interface Job {
  key: string;
  /** この時刻を過ぎたら流す（`HH:MM`） */
  at: string;
  /**
   * ひな形の id。無効にされていたら流さない。
   *
   * **`null` = ひな形を持たない仕事**（通知を出さない裏方の仕事）。
   * `notification_templates` は文面の表（件名・本文・宛先・社外か社内か）なので、
   * 通知しない仕事のためにダミー行を作らない。**止め方は環境変数**で持つ
   */
  templateId: string | null;
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
       LEFT JOIN companies c ON c.id = r.customer_id
      WHERE r.deleted_at IS NULL AND r.status = 'confirmed'
        AND r.paid_date IS NULL
        AND r.payment_due_date IS NOT NULL
        AND substr(r.payment_due_date, 1, 10) < ?`,
    [today],
  );
  if (rows.length === 0) return [];

  // `budget` は権限モデル単純化で `sales` に統合済み。以前は経理担当者だけに
  // 絞れていたが、いまは `sales:editor` を持つ全員（フルアクセスの正規メンバー）
  // が対象になる
  const keiri = await usersWithPermission('sales', 'editor');
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
  //
  // ⚠️ **期限は `COALESCE(due_at::date, due_date)` で見る**（期限一本化・
  // docs/core-redesign-plan.md §3-4）。以前は `due_date` しか見ておらず、
  // **`due_at` しか持たないタスク（マイタスク・依頼・投入口・GPM 由来）には
  // この通知が一度も飛ばなかった**。`due_at` は TIMESTAMP（時刻なし壁時計）なので
  // `::date` で日に落ちる。
  const rows = await queryAll(
    `SELECT t.id, t.title, t.assigned_to, p.name AS project_name
       FROM project_tasks t
       LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.deleted_at IS NULL AND t.is_completed IS NOT TRUE
        AND t.assigned_to IS NOT NULL
        AND COALESCE(t.due_at::date, t.due_date) = ?::date`,
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
      // リンク先は「やること」（/daily/tasks）。以前の /sales/tasks/list は sales 専用で、
      // **dailyops だけの担当者が通知から 403 に飛ばされていた**
      link: '/daily/tasks', refType: 'task', refId: String(t.id), refDate: today,
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
       LEFT JOIN companies c ON c.id = r.customer_id
      WHERE r.deleted_at IS NULL AND r.status = 'confirmed'
        AND r.invoice_issued IS NOT TRUE
        AND r.billing_date IS NOT NULL
        AND substr(r.billing_date, 1, 10) <= ?`,
    [today],
  );
  if (rows.length === 0) return [];
  // `budget` は権限モデル単純化で `sales` に統合済み。以前は経理担当者だけに
  // 絞れていたが、いまは `sales:editor` を持つ全員（フルアクセスの正規メンバー）
  // が対象になる
  const keiri = await usersWithPermission('sales', 'editor');
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

/**
 * ⚠️ **週報が「未確認」のまま止まっているものを督促する**
 * （UXレポート 2026-08-18 指摘・`docs/archive/2026/2026-08-19-uiux-operation-report-response.md` 5-2）。
 *
 * 週報 (`ops_reports.kind='weekly_activity'`) は「確定する（公開）」と同時にしか
 * `reviewed_at` が打刻されない作りだった。v4.1.8 で週報にも「確認済みにする」
 * ボタンを足したが（`WeeklyDetailPage.tsx`・既存の `POST /dailyops/reports/:id/review`
 * を接続しただけ）、確認するかどうかは人任せのままで、放っておくと恒久的に
 * 未確認のまま埋もれる。他の督促（未入金・機材返却・タスク期限）と同じ形で
 * 定時実行に載せる。
 */
const WEEKLY_REVIEW_REMIND_DAYS = 14;

/** 週報の未確認督促 → 日常業務を編集できる人（経理の督促と同じ「誰に送るか」の決め方） */
async function weeklyReportsUnreviewed(today: string): Promise<NotifyInput[]> {
  const threshold = shiftDate(today, -WEEKLY_REVIEW_REMIND_DAYS);
  const rows = await queryAll(
    `SELECT id, period_key
       FROM ops_reports
      WHERE kind = 'weekly_activity' AND deleted_at IS NULL
        AND reviewed_at IS NULL
        AND period_key <= ?`,
    [threshold],
  );
  if (rows.length === 0) return [];
  const reviewers = await usersWithPermission('dailyops', 'editor');
  const out: NotifyInput[] = [];
  for (const r of rows) {
    const week = String(r.period_key ?? '').replace(/-/g, '/');
    const vars = { '週': week };
    for (const u of reviewers) {
      out.push({
        userId: u, templateId: 'weekly_unreviewed',
        title: fill('［週報］{週} の週の報告がまだ確認されていません', vars),
        body: `確定（公開）していなくても構いません。内容を見て「確認済みにする」を押してください（${WEEKLY_REVIEW_REMIND_DAYS}日以上未確認のままです）。`,
        link: `/daily/weekly/${r.id}`, refType: 'ops_report', refId: String(r.id), refDate: today,
      });
    }
  }
  return out;
}

/**
 * 案件の自動整理 `project_tidy`（docs/core-redesign-plan.md §3-2）。
 *
 * 三段構え（すべて可逆・削除は絶対にしない）:
 *   (a) 整理候補（60日）… 生存証拠の無いネタを起票者へ「整理候補」として通知
 *   (b) 自動見送り（90日）… さらに30日誰も触らなければ e_lost
 *       （理由「自動整理（長期放置）」・**履歴付き**）へ動かして通知。**対象はネタだけ**
 *   (c) 受注→完了の繰り上げ … `event_end` を過ぎた受注案件を s_completed に（通知不要）
 *
 * 判定と実行の中身は **project-health.ts**（健全性の単一定義と同じモジュール）。
 * ここは通知の組み立てだけを持つ。
 *
 * **`templateId: null` で登録する**（裏方の仕事の形）— この仕事はステージも動かすので、
 * 通知のひな形を無効にしただけで (b)(c) まで黙って止まってはいけない。
 * ひな形（pj_tidy_candidate / pj_tidy_auto・migration 238）の enabled は
 * **通知を出すかどうかだけ**をここで個別に見る。仕事ごと止めたいときは
 * `PROJECT_TIDY_DAILY=off`（他の裏方仕事と同じ形）。
 *
 * 毎日再送しない仕掛け: 通知の `ref_date` を「候補になった日」（最後の動き＋しきい値）で
 * **固定**する。`today` を入れると一意索引（人×ひな形×対象×日）が毎日別の行を許し、
 * 同じ督促が毎朝出続ける（`TidyRow.ref_date` の理由）。
 */
async function tplEnabled(id: string): Promise<boolean> {
  const tpl = await queryOne(
    'SELECT enabled FROM notification_templates WHERE id = ?', [id],
  ) as { enabled?: boolean } | null;
  return !!tpl?.enabled;
}

async function projectTidy(_today: string): Promise<NotifyInput[]> {
  if ((process.env.PROJECT_TIDY_DAILY || '').toLowerCase() === 'off') return [];
  const out: NotifyInput[] = [];

  // (c) 受注→完了。ダッシュボードの GET /dashboard/check-completed と**同じ1本**を呼ぶ
  const completed = await completeElapsedWonProjects();

  // (b) 自動見送りを候補より**先に**。90日を超えた行が候補の通知と重ならないようにする
  const lost = await autoLoseStaleNeta();
  const autoOn = await tplEnabled('pj_tidy_auto');
  for (const r of lost) {
    // 起票者が居ない（退職・AI 起票の静的キー）行は通知しない。**見送り自体は行う** —
    // 通知できないからといってゴミを残すと、自動整理の意味が無くなる
    if (!autoOn || !r.creator_id) continue;
    out.push({
      userId: r.creator_id, templateId: 'pj_tidy_auto',
      title: fill('［自動見送り］{案件名} を見送りにしました', { '案件名': r.name }),
      body: `${TIDY_AUTO_LOST_DAYS}日以上動きが無かったため、自動で「見送り（自動整理・長期放置）」にしました。間違いであれば、案件のステージ帯からいつでも戻せます（削除はしていません）。`,
      link: `/sales/projects/${r.id}`, refType: 'project', refId: r.id, refDate: r.ref_date,
    });
  }

  // (a) 整理候補（60〜90日の帯）
  if (await tplEnabled('pj_tidy_candidate')) {
    for (const r of await listTidyCandidates()) {
      if (!r.creator_id) continue;
      const vars = { '案件名': r.name, '放置日数': String(r.stalled_days) };
      out.push({
        userId: r.creator_id, templateId: 'pj_tidy_candidate',
        title: fill(`［整理候補］{案件名} が${TIDY_CANDIDATE_DAYS}日動いていません`, vars),
        body: fill(
          `次の一手（次回アクション・期限つきタスク・実施日・スヌーズ）が無いまま {放置日数} 日動いていません。`
          + `このまま${TIDY_AUTO_LOST_DAYS - TIDY_CANDIDATE_DAYS}日動きが無ければ、自動で「見送り」に移します。`, vars),
        link: `/sales/projects/${r.id}`, refType: 'project', refId: r.id, refDate: r.ref_date,
      });
    }
  }

  // 黙って動かさない。ステージを機械が動かした日は記録に残す（画面には出ない仕事のため）
  if (completed || lost.length) {
    console.log('[scheduler] project_tidy:', JSON.stringify({ completed, autoLost: lost.length }));
  }
  return out;
}

/**
 * ふりかえり（KPT）の下書き → 案件の担当に「できました」
 *
 * ── なぜ「実施日の翌日」なのか ──────────────────────────────
 *
 * 当日はまだ撤収中で、材料（当日のやり取り）も出そろっていません。
 * かといって1週間置くと**書ける人が覚えていません**。翌日が境目です。
 *
 * ── 二度は起こさない ────────────────────────────────────────
 *
 * `scheduled_job_runs` がその日ぶんを1回に絞り、さらに
 * `generateKptDraft` が**未確認の下書きが残っている案件を飛ばします**。
 * 押し直しても同じ内容が2組できません。
 *
 * ── AI につないでいない環境では何もしない ──────────────────
 *
 * 検証環境や手元では鍵が無いことがあります。**毎日エラーを出さない** —
 * 出すと本当の失敗が埋もれます。
 */
/**
 * 1晩に **AI を呼ぶ**回数の上限。**増やす前に費用と所要時間を測ること**
 * （1件が数十秒かかります）。
 *
 * ⚠️ **数えるのは「引いた行」ではなく「AI を呼んだ回数」**（レビューでの指摘）。
 * `generateKptDraft` は **AI を呼ぶ前に**2通りで諦めます（未確認の下書きが
 * 残っている／材料になるやり取りが1件も無い）。これらは行を作らないので
 * **翌晩もまた対象になります** — 引いた行で数えると、
 * **その 20 件が毎晩いちばん古い側の枠を全部埋め**、新しい案件は
 * 窓（7日）から出るまで一度も下書きが作られません。
 * **費用が掛かっていないものは枠を使わない**のが正しい数え方です。
 */
const KPT_PER_NIGHT = 20;

/**
 * 1晩に見にいく案件の上限。**上の上限とは別**（諦めるものは費用が掛からないので、
 * 通り過ぎるだけです）。それでも無制限にはしない — 窓の中の案件が増えたときに
 * 夜間の仕事が終わらなくなる。
 */
const KPT_SCAN_MAX = 200;

/**
 * さかのぼって拾う日数。**上限で切ったぶんを翌晩以降に拾う**ための窓で、
 * 短すぎると取りこぼしが消え、長すぎると「もう振り返らない案件」まで起こします。
 */
const KPT_LOOKBACK_DAYS = 7;

async function kptDraftYesterday(today: string): Promise<NotifyInput[]> {
  if (!isKptAiConfigured()) return [];
  const yesterday = shiftDate(today, -1);

  /*
   * **終わった案件だけ**。`event_end` が空なら `event_start` を見ます（1日の案件）。
   * 失注は対象外 — 実施していないので、ふりかえる中身がありません。
   * 既に KPT が1件でもある案件も外します（人が先に書いていたら邪魔しない）。
   */
  /*
   * ⚠️ **1晩で片づかなかったぶんを翌晩に拾う**（レビューでの指摘 #83）。
   *
   * 前の版は「**昨日**終わった案件」だけを見て `LIMIT 20` で切っていました。
   * 同じ日に 21 件以上終わる週（大きなイベントの前後では普通に起きます）では、
   * **21 件目からは下書きが一生作られません** — この仕事は日に1回で、
   * 翌日はまた「その日の昨日」を見るので、**取りこぼしは二度と拾われません**。
   * しかも作られなかったことは**どこにも出ません**。
   *
   * **窓を7日にして、古いものから順に**片づけます。1晩あたりの上限（20 件）は
   * そのままなので、AI の呼び出しが増えることはありません。
   * すでに KPT がある案件は `NOT EXISTS` が外すので、二度作られません。
   */
  const from = shiftDate(today, -KPT_LOOKBACK_DAYS);
  const rows = await queryAll(
    `SELECT p.id, p.name, p.assigned_to,
            COALESCE(NULLIF(p.event_end, ''), NULLIF(p.event_start, '')) AS ended_on
       FROM projects p
      WHERE p.deleted_at IS NULL
        AND p.stage <> 'e_lost'
        AND COALESCE(NULLIF(p.event_end, ''), NULLIF(p.event_start, '')) BETWEEN ? AND ?
        AND NOT EXISTS (SELECT 1 FROM event_report_kpt k WHERE k.project_id = p.id)
      ORDER BY ended_on ASC
      LIMIT ?`,
    [from, yesterday, KPT_SCAN_MAX],
  ) as { id: string; name: string; assigned_to: string; ended_on: string }[];

  const out: NotifyInput[] = [];
  /** AI を呼んだ回数。**引いた行数ではない**（上の `KPT_PER_NIGHT` の理由） */
  let calls = 0;
  /** 費用の掛からない理由で通り過ぎた件数（記録に出す） */
  let passed = 0;
  let leftOver = 0;

  for (const [i, p] of rows.entries()) {
    if (calls >= KPT_PER_NIGHT) { leftOver = rows.length - i; break; }
    try {
      // **起票する人は案件の担当。** 定時実行には押した人が居ないので、
      // 「誰の名前で書かれたか」は担当に寄せる（`kpt.service` と同じ）
      const { created, aiCalled } = await generateKptDraft(p.id, p.assigned_to);
      if (aiCalled) calls += 1; else passed += 1;
      if (created === 0) continue;
      out.push({
        userId: p.assigned_to, templateId: 'kpt_draft',
        title: fill('［ふりかえり］{案件名} の下書きができました', { '案件名': p.name }),
        body: fill('{件数} 件の下書きをつくりました。まだ確かめられていません', { '件数': String(created) }),
        link: `/sales/projects/${p.id}/review`, refType: 'project', refId: p.id, refDate: today,
      });
    } catch (e) {
      // **1件の失敗で他の案件を止めない。** 材料が薄い案件・API が混んでいる回がある
      console.error('[scheduler] kpt_draft failed:', p.id, (e as Error).message);
    }
  }

  /*
   * **黙って切らない。** 作られなかった案件があることは画面に出ないので、
   * 記録に残さないと誰も気づけません。
   * `leftOver` は上限で明晩に回した数、`passed` は費用の掛からない理由で
   * 通り過ぎた数（材料が無い／未確認の下書きが残っている）です。
   */
  if (leftOver > 0 || rows.length >= KPT_SCAN_MAX) {
    console.warn('[scheduler] kpt_draft:', JSON.stringify({
      scanned: rows.length, calls, passed, leftOver,
      scanCapped: rows.length >= KPT_SCAN_MAX,
    }));
  }
  return out;
}

/**
 * 前日までに取り込まれた「まだ整えていないやり取り」を整える（migration 187）。
 *
 * メール取込（MCP `create_activity_log`）は整形器を通らないので、
 * **放っておくと素のテキストのまま溜まります**。ここで毎晩ぶんを整えます。
 *
 * - **通知は出しません**（`[]` を返す）。整形は裏方の仕事で、
 *   毎朝「N件整えました」が届くと通知が意味を失う
 * - **1回の上限を置きます。** 溜まっている分を一晩で全部呼ぶと、
 *   費用が読めないまま朝には終わっている。**過去ぶんは設定画面から人が流す**
 * - **深夜に置きます。** AI を呼ぶので他の仕事と重ねない（`kpt_draft` と同じ理由）
 */
async function formatPendingActivities(): Promise<NotifyInput[]> {
  // **止められるようにしておく。** 費用が気になるときに毎晩の呼び出しを切れる
  // （過去ぶんは設定画面から人が流せるので、切っても手が無くなるわけではない）
  if ((process.env.ACTIVITY_FORMAT_NIGHTLY || '').toLowerCase() === 'off') return [];
  try {
    const r = await runFormatPass({ limit: 40, actorId: null });
    if (r.formatted || r.failed) {
      console.log('[scheduler] activity_format:', JSON.stringify(r));
    }
  } catch (e) {
    console.error('[scheduler] activity_format failed:', (e as Error).message);
  }
  return [];
}

/**
 * 「次にやること」の長文を、帯の1行に収まる短い一文にする（migration 190）。
 *
 * **3:10 に置くのは 3:00 の整形のあとにするため。** 整形が `next_action` を
 * 埋めた行を、その晩のうちに短くできます（逆順だと1日遅れる）。
 *
 * - **通知は出しません**（`[]`）。裏方の仕事で、毎朝「N件短くしました」は要らない
 * - **1回の上限を置きます**（過去ぶんは `POST /activity-logs/short-run` で人が流す）
 * - 止めたいときは `NEXT_ACTION_SHORT_NIGHTLY=off`（整形と同じ形）
 */
async function shortenPendingNextActions(): Promise<NotifyInput[]> {
  if ((process.env.NEXT_ACTION_SHORT_NIGHTLY || '').toLowerCase() === 'off') return [];
  try {
    const r = await runShortPass({ limit: 40, actorId: null });
    if (r.shortened || r.failed) console.log('[scheduler] next_action_short:', JSON.stringify(r));
  } catch (e) {
    console.error('[scheduler] next_action_short failed:', (e as Error).message);
  }
  return [];
}

/**
 * 制作資料 v4 段7（AI 提案）— 放置提案の期限切れ。**AI を呼ばない。**
 * 止めたいときは `QSHEET_AI_EXPIRE_NIGHTLY=off`（整形・短縮と同じ形）。
 */
async function expireQsheetAiProposals(): Promise<NotifyInput[]> {
  if ((process.env.QSHEET_AI_EXPIRE_NIGHTLY || '').toLowerCase() === 'off') return [];
  try {
    const n = await expireOpenProposals();
    if (n) console.log('[scheduler] qsheet_ai_expire:', JSON.stringify({ expired: n }));
  } catch (e) {
    console.error('[scheduler] qsheet_ai_expire failed:', (e as Error).message);
  }
  return [];
}

/**
 * 制作資料 v4 段7（AI 提案）— 締めの2段（early/final）。**AI を呼ばない。**
 * `qsheet_ai_expire`（03:15）の直後に置くのは、期限切れにした提案を締め対象から
 * 先に外しておくため（順序が逆でも壊れはしないが、拾う母数が無駄に増える）。
 * 止めたいときは `QSHEET_AI_SETTLE_NIGHTLY=off`。
 */
async function settleQsheetAiProposals(): Promise<NotifyInput[]> {
  if ((process.env.QSHEET_AI_SETTLE_NIGHTLY || '').toLowerCase() === 'off') return [];
  try {
    const r = await settleDueProposals();
    if (r.early || r.final || r.failed) console.log('[scheduler] qsheet_ai_settle:', JSON.stringify(r));
  } catch (e) {
    console.error('[scheduler] qsheet_ai_settle failed:', (e as Error).message);
  }
  return [];
}

/**
 * 制作資料 v4 段9（04-ai.md §5-5）— 月次 AI レビューの自動下書き。
 * **毎月1日だけ動く**（`runMonthlyReviewIfDue` が日付を見て他の日は即 `[]` を返す）。
 * 既存の 03:15/03:20（AI 提案の期限切れ・締め）の直後に置く。**AI を1回も呼ばない**
 * （既存の集計を読むだけ・best-effort）。止めたいときは `QSHEET_AI_REVIEW_NIGHTLY=off`。
 */
async function qsheetAiReviewDraft(today: string): Promise<NotifyInput[]> {
  if ((process.env.QSHEET_AI_REVIEW_NIGHTLY || '').toLowerCase() === 'off') return [];
  try {
    return await runMonthlyReviewIfDue(today);
  } catch (e) {
    console.error('[scheduler] ai_review_production_draft failed:', (e as Error).message);
    return [];
  }
}

const JOBS: Job[] = [
  // 案件の自動整理。朝いちの通知3本（09:00）より前に済ませる — 繰り上げ（受注→完了）を
  // 先にしておかないと、その日の他の集計・通知が「終わったのに受注のまま」の行を数える。
  // templateId は null（ひな形で止めない理由は projectTidy の説明）。止め方は PROJECT_TIDY_DAILY=off
  { key: 'project_tidy', at: '07:30', templateId: null, run: projectTidy },
  { key: 'tk_due', at: '09:00', templateId: 'tk_due', run: tasksDueSoon },
  { key: 'inv_late', at: '09:00', templateId: 'inv_late', run: overdueInvoices },
  { key: 'eq_return', at: '09:00', templateId: 'eq_return', run: equipmentOverdue },
  { key: 'inv_send_todo', at: '09:30', templateId: 'inv_send_todo', run: invoiceSendTodo },
  { key: 'bk_remind_todo', at: '17:00', templateId: 'bk_remind_todo', run: bookingRemindTodo },
  // 9:30 にするのは、9:00 の3本（期限・督促・返却）と重ねないため。
  // AI を呼ぶので他より時間がかかり、重ねると朝いちの通知が遅れる
  { key: 'kpt_draft', at: '09:30', templateId: 'kpt_draft', run: kptDraftYesterday },
  // AI を呼ばない軽い問い合わせなので kpt_draft の直後でよい
  { key: 'weekly_unreviewed', at: '09:45', templateId: 'weekly_unreviewed', run: weeklyReportsUnreviewed },
  // 通知を出さない裏方の仕事（ひな形なし）。深夜に置くのは AI を呼ぶ仕事を朝と重ねないため。
  // 止めたいときは `ACTIVITY_FORMAT_NIGHTLY=off`
  { key: 'activity_format', at: '03:00', templateId: null, run: formatPendingActivities },
  // 整形のあとに置く（整形が `next_action` を埋めた行を同じ晩に短くする）
  { key: 'next_action_short', at: '03:10', templateId: null, run: shortenPendingNextActions },
  // 制作資料 v4 段7（AI 提案）。既存の 03:00/03:10（AI を呼ぶ仕事）と重ねないための 03:15/03:20。
  // **どちらも AI を1回も呼ばない**（突合・期限切れの判定だけ）
  { key: 'qsheet_ai_expire', at: '03:15', templateId: null, run: expireQsheetAiProposals },
  { key: 'qsheet_ai_settle', at: '03:20', templateId: null, run: settleQsheetAiProposals },
  // 段9（04-ai.md §5-5）。月次レビューの下書き＋通知。実際に動くのは毎月1日だけ
  // （`qsheetAiReviewDraft` の中で日付を見る。仕組みは他の日次仕事と同じ15分ポーリングに乗せる）
  { key: AI_REVIEW_JOB_KEY, at: '03:25', templateId: AI_REVIEW_NOTIFY_TEMPLATE_ID, run: qsheetAiReviewDraft },
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

    // ひな形が無効にされていたら流さない（設定の画面で止められる）。
    // **ひな形を持たない仕事（通知を出さない裏方）はこの検査を通さない** —
    // 通さないと、ダミー行を作るまで黙って1回も走らない
    if (job.templateId !== null) {
      const tpl = await queryOne(
        'SELECT enabled FROM notification_templates WHERE id = ?', [job.templateId],
      ) as { enabled?: boolean } | null;
      if (!tpl?.enabled) continue;
    }

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
