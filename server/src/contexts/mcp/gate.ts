import { queryOne, queryAll } from '../../shared/db/connection';
import type { McpActor } from './helpers';

// MCP 書き込みツールの権限ゲート。
//
// mcpAuth は「認証」(静的APIキー or OAuthトークン検証) を行うが、OAuth 経由 (per-user)
// の actor がそのユーザーの ONAiR モジュール権限を持つかは検証していなかった。そのため
// 閲覧のみ / 権限なしの ONAiR アカウントでも OAuth ダンスを完走すれば MCP 経由で案件作成・
// GLS発番・見積確定・財務登録などが可能で、HTTP 側の requirePermission による権限モデルを
// 完全にバイパスしていた。このゲートで OAuth actor には対応モジュールの権限を要求する。
//
// - 静的 APIキー actor: フルアクセス運用鍵として素通り (docs/mcp-server.md 参照)。
// - OAuth actor: 書き込みツールは対応モジュールの権限 (下表) を要求。
// - 表に無いツール (list_* / get_* 等の読み取り系) はゲートなし。
//
// 各ツールの module / level は対応する HTTP ルートの requirePermission に揃えてある。
const WRITE_TOOL_PERMISSIONS: Record<string, { module: string; level: 'editor' | 'manager' }> = {
  // sales (案件・顧客・営業活動・タスク・見積・keep-report[イベント報告/議事録/月次予算])
  create_activity_log: { module: 'sales', level: 'editor' },
  update_activity_log: { module: 'sales', level: 'editor' },
  create_customer: { module: 'sales', level: 'editor' },
  update_customer: { module: 'sales', level: 'editor' },
  create_project: { module: 'sales', level: 'editor' },
  update_project: { module: 'sales', level: 'editor' },
  change_project_stage: { module: 'sales', level: 'editor' },
  issue_gls: { module: 'sales', level: 'editor' },
  add_project_member: { module: 'sales', level: 'editor' },
  remove_project_member: { module: 'sales', level: 'editor' },
  set_project_simulation: { module: 'sales', level: 'editor' },
  create_task: { module: 'sales', level: 'editor' },
  update_task: { module: 'sales', level: 'editor' },
  move_task: { module: 'sales', level: 'editor' },
  reorder_tasks: { module: 'sales', level: 'editor' },
  delete_task: { module: 'sales', level: 'editor' },
  bulk_create_tasks: { module: 'sales', level: 'editor' },
  add_task_dependency: { module: 'sales', level: 'editor' },
  remove_task_dependency: { module: 'sales', level: 'editor' },
  upsert_event_report: { module: 'sales', level: 'editor' },
  attach_event_photo: { module: 'sales', level: 'editor' },
  detach_event_photo: { module: 'sales', level: 'editor' },
  upsert_meeting_minutes: { module: 'sales', level: 'editor' },
  upsert_monthly_budget: { module: 'sales', level: 'editor' },
  upsert_monthly_actual_override: { module: 'sales', level: 'editor' },
  // dailyops (日常業務: 見積/請求書・問い合わせ・内覧会・週報/ニュース・セキュリティカード)
  record_finance_doc: { module: 'dailyops', level: 'editor' },
  record_inquiry: { module: 'dailyops', level: 'editor' },
  register_inview_attendee: { module: 'dailyops', level: 'editor' },
  submit_ops_report: { module: 'dailyops', level: 'editor' },
  add_ops_report_items: { module: 'dailyops', level: 'editor' },
  // セキュリティカードの貸出/返却 (v2.9.229 で追加された際に登録が漏れており、
  // OAuth 経由で dailyops 権限の無いユーザーでも実行できる状態だった。
  // HTTP 側 security-card.routes.ts の canEdit = requirePermission('dailyops','editor') と一致させる)
  lend_security_card: { module: 'dailyops', level: 'editor' },
  return_security_card: { module: 'dailyops', level: 'editor' },
  // studio (スタジオ予約カレンダー)
  create_studio_booking: { module: 'studio', level: 'editor' },
};

const LEVEL_ORDER: Record<string, number> = { reader: 1, exporter: 1, editor: 2, manager: 3, owner: 3 };

async function actorHasPermission(
  userId: string,
  module: string,
  minLevel: 'editor' | 'manager',
): Promise<boolean> {
  const user = (await queryOne('SELECT role FROM users WHERE id = ?', [userId])) as { role?: string } | null;
  if (!user) return false;
  if (user.role === 'system_admin') return true;
  const rows = (await queryAll(
    'SELECT access_level FROM user_permissions WHERE user_id = ? AND module = ?',
    [userId, module],
  )) as Array<{ access_level: string }>;
  if (rows.length === 0) return false;
  const lvl = LEVEL_ORDER[rows[0].access_level] ?? 0;
  return lvl >= LEVEL_ORDER[minLevel];
}

/**
 * tools/call の書き込みツールに対し OAuth actor のモジュール権限を検証する。
 * 不足時は Error を投げる (呼び出し側が JSON-RPC 403 応答に変換する)。
 * JSON-RPC バッチ (配列) にも対応。
 */
export async function enforceToolPermissions(body: unknown, actor: McpActor): Promise<void> {
  // 静的 APIキーはフルアクセス運用鍵として素通り
  if (!actor.isOAuth) return;
  const messages = Array.isArray(body) ? body : [body];
  for (const msg of messages) {
    const m = msg as { method?: string; params?: { name?: string } } | null;
    if (m?.method !== 'tools/call') continue;
    const name = m.params?.name;
    if (typeof name !== 'string') continue;
    const need = WRITE_TOOL_PERMISSIONS[name];
    if (!need) continue; // 読み取りツール等はゲートなし
    const allowed = await actorHasPermission(actor.actorId, need.module, need.level);
    if (!allowed) {
      throw new Error(
        `権限が不足しています: ツール '${name}' には「${need.module}」モジュールの ${need.level} 以上の権限が必要です`,
      );
    }
  }
}
