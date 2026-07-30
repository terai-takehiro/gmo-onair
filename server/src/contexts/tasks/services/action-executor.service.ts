/**
 * 行動案の実行 — 人が確認した提案を ONAiR の操作として実際に流す。
 *
 * ── 既存の service を呼ぶ (SQL を書き直さない) ────────────────
 *
 * どの操作も**画面や MCP が使っているのと同じ service** を呼ぶ。ここで INSERT を
 * 書き直すと、案件作成の BOX フォルダ生成・ステージの必須チェック・見積の粗利計算
 * といった付随処理が片方だけ抜け、「画面から作った案件」と「AI が作った案件」で
 * 中身が違うものになる。実際に MCP 側も同じ理由で service を呼んでいる。
 *
 * ── 権限は「押した人」のもので確かめる ──────────────────────
 *
 * AI を通したら権限が増える、ということが絶対にあってはいけない。
 * 各操作に必要なモジュール権限 (action-catalog.ts の module/level) を
 * 実行者の権限と突き合わせ、足りなければその 1 件だけ実行しない
 * (残りは実行する。1 件の権限不足で全部を落とすと業務が進まない)。
 *
 * ── 1 件失敗しても他を止めない ────────────────────────────
 *
 * 提案は「お客様 → 案件 → その案件への見積」のように連なる。前が失敗したら
 * 後ろは前提が無いので飛ばすが、独立した提案は実行する。結果は 1 件ずつ
 * 成否と理由を返し、画面が「何ができて何ができなかったか」を出せるようにする。
 */

import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { buildBookingTitle } from '../../../shared/booking/bookingTitle';
import { meetsPermissionLevel } from '../../../shared/middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { ACTION_CATALOG, type ActionKind } from './action-catalog';
import type { ActionDraft } from './action-ai.service';
import { projectService } from '../../sales/services/project.service';
import { activityLogService } from '../../sales/services/activity-log.service';
import { studioBookingService } from '../../production/services/studio-booking.service';
import { inquiryService } from '../../dailyops/services/inbox.service';
import { keepReportService } from '../../sales/services/keep-report.service';
import { appendNotes } from '../../sales/services/project-collab-append.service';
import { saveEstimate } from '../../sales/services/estimate.service';
import { myTasksService } from './my-tasks.service';
import {
  assertStageRequirements, applyStageAnswers,
} from '../../sales/services/stage-ask.service';

export interface ActionResult {
  action_key: string;
  kind: ActionKind;
  ok: boolean;
  /** 人に見せる 1 行 (「案件『A社 配信』をつくりました」) */
  message: string;
  /** 失敗した理由 (ok=false のときだけ) */
  error?: string;
  /** 作られた / 変えられたレコード */
  target_table?: string;
  target_id?: string;
  /** 画面のリンク先 (相対パス)。無ければ出さない */
  link?: string;
  /** 前の提案が失敗したので飛ばした */
  skipped?: boolean;
}

/** 実行者の権限 (モジュール → レベル)。1 回引いて使い回す */
async function loadActorPermissions(userId: string): Promise<{ role: string; levels: Record<string, string> }> {
  const user = (await queryOne('SELECT role FROM users WHERE id = ?', [userId])) as { role?: string } | null;
  const rows = (await queryAll(
    'SELECT module, access_level FROM user_permissions WHERE user_id = ?',
    [userId],
  )) as { module: string; access_level: string }[];
  const levels: Record<string, string> = {};
  for (const r of rows) levels[r.module] = r.access_level;
  return { role: user?.role ?? 'staff', levels };
}

const MODULE_LABEL: Record<string, string> = {
  sales: '案件管理', dailyops: '日常業務', studio: 'スタジオ予約',
};

/**
 * 実行する。**渡された順に流す** (お客様 → 案件 → 見積 の順序が意味を持つ)。
 *
 * 直前に作られたレコードは `bag` に入れ、後続の提案で id が空のときに補う
 * (AI は「これから作るお客様」の id を知り得ないので、ここで繋ぐ必要がある)。
 */
export async function executeActions(
  actions: ActionDraft[],
  actor: { userId: string },
): Promise<ActionResult[]> {
  const perms = await loadActorPermissions(actor.userId);
  const results: ActionResult[] = [];

  // 直前の提案が作ったもの。同じ投入の中で「作ったお客様の案件」を繋ぐのに使う
  const bag: { customerId?: string; projectId?: string } = {};

  for (const a of actions) {
    const spec = ACTION_CATALOG[a.kind];
    if (!spec) {
      results.push({ action_key: a.action_key, kind: a.kind, ok: false, message: '不明な操作です', error: 'UNKNOWN_ACTION' });
      continue;
    }

    // 権限。足りなければこの 1 件だけ実行しない
    if (!meetsPermissionLevel(perms.role, perms.levels[spec.module], spec.level)) {
      results.push({
        action_key: a.action_key, kind: a.kind, ok: false,
        message: `${spec.label}は実行できませんでした`,
        error: `「${MODULE_LABEL[spec.module] ?? spec.module}」の編集権限が必要です`,
      });
      continue;
    }

    try {
      const r = await runOne(a, actor, bag);
      results.push({ action_key: a.action_key, kind: a.kind, ...r });
      if (r.ok && r.target_table === 'customers' && r.target_id) bag.customerId = r.target_id;
      if (r.ok && r.target_table === 'projects' && r.target_id) bag.projectId = r.target_id;
    } catch (e) {
      // ここで throw させない。1 件の失敗で他の提案まで消えると、
      // 投げ直しになって「AI に投げても結局手で入れる」に戻ってしまう
      results.push({
        action_key: a.action_key, kind: a.kind, ok: false,
        message: `${spec.label}は実行できませんでした`,
        error: (e as Error).message,
      });
    }
  }
  return results;
}

type RunResult = Omit<ActionResult, 'action_key' | 'kind'>;

async function runOne(
  a: ActionDraft,
  actor: { userId: string },
  bag: { customerId?: string; projectId?: string },
): Promise<RunResult> {
  // 同じ投入の中で先に作られたものを引き継ぐ
  const customerId = a.customer_id ?? bag.customerId ?? null;
  const projectId = a.project_id ?? bag.projectId ?? null;

  switch (a.kind) {
    // ── タスク・依頼 ────────────────────────────────────
    case 'create_task': {
      if (!a.assignee_id) return fail('担当者が決まっていません');
      const task = await myTasksService.createTask({
        title: a.title,
        description: a.text,
        project_id: projectId,
        assigned_to: a.assignee_id,
        // 自分以外を担当にしたら依頼になる (相手の承諾が要る)
        requester_id: a.assignee_id !== actor.userId ? actor.userId : null,
        due_at: a.due_at,
        importance: a.importance,
        urgency: a.due_at ? a.urgency : 1,
        source: 'ai-action',
      }, actor.userId) as { id: string };
      return {
        ok: true, message: `タスク「${a.title}」をつくりました`,
        target_table: 'project_tasks', target_id: task.id, link: '/daily/tasks',
      };
    }

    // ── お客様 ────────────────────────────────────────
    case 'create_customer': {
      const name = (a.customer_name || a.title).trim();
      if (!name) return fail('お客様の名前が読み取れませんでした');
      // 同名が既にあれば作らずそれを使う (AI 経由で顧客マスタが二重化するのを防ぐ)
      const dup = (await queryOne(
        'SELECT id, name FROM customers WHERE deleted_at IS NULL AND name = ? LIMIT 1', [name],
      )) as { id: string; name: string } | null;
      if (dup) {
        return {
          ok: true, message: `お客様「${dup.name}」は既に登録されていました (新しく作っていません)`,
          target_table: 'customers', target_id: dup.id, link: `/sales/customers/${dup.id}`,
        };
      }
      const id = uuidv4();
      await execute(
        `INSERT INTO customers (id, name, notes, created_by) VALUES (?, ?, ?, ?)`,
        [id, name, a.text ?? null, actor.userId],
      );
      return {
        ok: true, message: `お客様「${name}」を登録しました`,
        target_table: 'customers', target_id: id, link: `/sales/customers/${id}`,
      };
    }

    // ── 案件 ──────────────────────────────────────────
    case 'create_project': {
      if (!a.title) return fail('案件名が読み取れませんでした');
      if (!customerId) return fail('お客様が決まっていません');
      if (!a.gls_category) return fail('案件分類 (スタジオ / ビジネス) が決まっていません');
      const row = await projectService.create({
        name: a.title,
        customer_id: customerId,
        gls_category: a.gls_category,
        // 主担当は投入した人。AI が読み取った担当は「その案件の担当」とは別物なので使わない
        assigned_to: actor.userId,
        expected_amount: a.amount || undefined,
        event_start: a.date ?? undefined,
        event_end: a.date_end ?? a.date ?? undefined,
        notes: a.text ?? undefined,
      }, actor.userId) as { id: string; code?: string };
      return {
        ok: true, message: `案件「${a.title}」をネタとしてつくりました`,
        target_table: 'projects', target_id: row.id, link: `/sales/projects/${row.id}`,
      };
    }

    // ── ステージ ──────────────────────────────────────
    case 'change_project_stage': {
      if (!projectId) return fail('対象の案件が決まっていません');
      if (!a.stage) return fail('どのステージにするかが読み取れませんでした');
      // 画面と同じ必須チェックを通す。足りなければ**動かさずに理由を返す**
      // (ここを飛ばすと空欄のまま先の段に進んだ案件ができて後から埋められない)
      const answers: Record<string, unknown> = {};
      if (a.date) { answers.event_start = a.date; answers.event_end = a.date_end ?? a.date; }
      if (a.amount > 0) answers.expected_amount = a.amount;
      if (a.stage === 'e_lost') answers.lost_reason = a.text ?? '（AI 投入・理由未記入）';
      await assertStageRequirements(projectId, a.stage, answers);
      await applyStageAnswers(projectId, a.stage, answers, actor.userId);
      const row = await projectService.changeStage(
        projectId, a.stage, answers, actor.userId,
      ) as { id: string; name?: string };
      return {
        ok: true, message: `案件「${row.name ?? ''}」を ${STAGE_LABEL[a.stage] ?? a.stage} にしました`,
        target_table: 'projects', target_id: row.id, link: `/sales/projects/${row.id}`,
      };
    }

    // ── GLS 発番 ──────────────────────────────────────
    case 'issue_gls': {
      if (!projectId) return fail('対象の案件が決まっていません');
      const row = await projectService.issueGls(projectId, {}, actor.userId) as
        { id: string; gls_number?: string };
      return {
        ok: true, message: `GLS番号 ${row.gls_number ?? ''} を発番しました`,
        target_table: 'projects', target_id: row.id, link: `/sales/projects/${row.id}`,
      };
    }

    // ── 見積 ──────────────────────────────────────────
    case 'create_estimate': {
      if (!projectId) return fail('対象の案件が決まっていません');
      if (a.estimate_items.length === 0) return fail('見積の明細が読み取れませんでした');
      await saveEstimate(projectId, {
        items: a.estimate_items.map((it) => ({
          description: it.description,
          category: it.category,
          quantity: it.quantity,
          unit: it.unit,
          unit_price: it.unit_price,
          amount: Math.round(it.unit_price * it.quantity),
          cost_amount: it.cost_amount,
          // AI が出した行であることを残す。人がどの行を直したかの教師データになる
          is_ai_suggested: true,
        })),
        notes: a.text,
      }, { userId: actor.userId });
      return {
        ok: true,
        message: `見積の下書きを ${a.estimate_items.length} 行つくりました (確定はしていません)`,
        target_table: 'projects', target_id: projectId,
        link: `/sales/projects/${projectId}/estimates`,
      };
    }

    // ── スタジオ予約 ──────────────────────────────────
    case 'create_studio_booking': {
      if (!a.date) return fail('日付が読み取れませんでした');
      // 題名は **確認画面で人が見て通したもの (a.title) をそのまま使う**。
      // 画面 (AiActionBox の「件名・やること」) は編集できる欄として出しているので、
      // ここで案件名+日付に置き換えると**人が打ち替えた文字が黙って消える**
      // (予約ダイアログで titleTouched を入れたのと同じ理由)。
      //
      // 揃えるのは**画面に出す既定値の側**でやる: 案件を選ぶと欄が
      // `案件名 (YY/MM/DD)` になるので、人はその形を見たうえで通すか直すかを決められる。
      // ここは空だったときの受け皿だけを持つ。
      const proj = projectId
        ? await queryOne(`SELECT name FROM projects WHERE id = ? AND deleted_at IS NULL`, [projectId]) as { name?: string } | null
        : null;
      const title = String(a.title ?? '').trim()
        || buildBookingTitle({ projectName: proj?.name, date: a.date });
      const booking = await studioBookingService.createBooking({
        title,
        booking_type: 'hold',
        project_id: projectId,
        all_day: true,
        start_time: a.date,
        end_time: a.date_end ?? a.date,
        // 部屋は読み取れないことが多い。押さえた部屋が違うと現場が困るので、
        // 部屋なしの仮押さえで入れて人にカレンダーで直させる (勝手に選ばない)
        status: 'tentative',
        notes: a.text ?? 'AI 投入から作成 (部屋はカレンダーで指定してください)',
      } as Parameters<typeof studioBookingService.createBooking>[0], actor.userId) as { id: string };
      return {
        ok: true, message: `${a.date} に「${title}」を仮押さえしました (部屋は未指定)`,
        target_table: 'studio_bookings', target_id: booking.id, link: '/schedule?layers=studio',
      };
    }

    // ── 営業活動 ──────────────────────────────────────
    case 'create_activity_log': {
      if (!a.title) return fail('件名が読み取れませんでした');
      if (!a.date) return fail('活動した日付が読み取れませんでした');
      const row = await activityLogService.create({
        project_id: projectId,
        customer_id: customerId,
        activity_type: a.activity_type ?? 'other',
        activity_date: a.date,
        subject: a.title,
        description: a.text,
        next_action: a.next_action,
        next_action_date: a.next_action_date,
      }, actor.userId) as { id: string };
      return {
        ok: true, message: `やり取り「${a.title}」を記録しました`,
        target_table: 'activity_logs', target_id: row.id,
        link: projectId ? `/sales/projects/${projectId}` : '/sales/activities',
      };
    }

    // ── 問い合わせ ────────────────────────────────────
    case 'record_inquiry': {
      const summary = (a.text || a.title).trim();
      if (!summary) return fail('内容が読み取れませんでした');
      const { row } = await inquiryService.create({
        sender: a.customer_name,
        subject: a.title || null,
        summary,
        importance: a.importance >= 3 ? 'high' : a.importance <= 1 ? 'low' : 'medium',
        action_needed: a.next_action,
        received_at: a.date,
        source: 'ai-action',
        created_by: actor.userId,
      });
      return {
        ok: true, message: '問い合わせとして記録しました',
        target_table: 'misc_inquiries', target_id: String(row.id), link: '/daily/inbox',
      };
    }

    // ── 議事録 ────────────────────────────────────────
    case 'upsert_meeting_minutes': {
      if (!a.date) return fail('会議の日付が読み取れませんでした');
      const decisions = a.minutes_decisions.length > 0
        ? a.minutes_decisions
        : (a.text ? [a.text] : []);
      if (decisions.length === 0) return fail('決定事項が読み取れませんでした');
      const { action } = await keepReportService.upsertMinutes(a.date, { decisions });
      return {
        ok: true,
        message: `${a.date} の議事録を${action === 'created' ? '作りました' : '更新しました'} (決定事項 ${decisions.length} 件)`,
        target_table: 'meeting_minutes', target_id: a.date, link: '/sales/keep-report',
      };
    }

    // ── 案件メモ ──────────────────────────────────────
    case 'append_project_note': {
      if (!projectId) return fail('対象の案件が決まっていません');
      const body = (a.text || a.title).trim();
      if (!body) return fail('書き足す内容が読み取れませんでした');
      await appendNotes(projectId, body, { userId: actor.userId, requestedBy: null });
      return {
        ok: true, message: '案件のメモに書き足しました',
        target_table: 'project_collab', target_id: projectId, link: `/sales/projects/${projectId}`,
      };
    }

    default: {
      // カタログに操作を足して実行を書き忘れたときに気付けるようにする
      const never: never = a.kind;
      return fail(`実行が実装されていない操作です: ${String(never)}`);
    }
  }
}

const STAGE_LABEL: Record<string, string> = {
  neta: 'ネタ', d_hold: '仮押さえ', c_proposal: '見積提案', b_verbal: '口頭決定',
  a_won: '受注', s_completed: '完了', e_lost: '失注',
};

function fail(reason: string): RunResult {
  return { ok: false, message: '実行できませんでした', error: reason };
}
