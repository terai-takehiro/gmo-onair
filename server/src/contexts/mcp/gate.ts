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
const WRITE_TOOL_PERMISSIONS: Record<string, { module: string | string[]; level: 'editor' | 'manager' }> = {
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
  // v4 ⑥: 受け取った書類は財務へ移し、HTTP 側を `dailyops` か `budget` の
  // **どちらか**で通すようにした (経理が 403 で開けなかった)。
  // **MCP 側も同じにする** — 片方だけ直すと、画面からは書けるのに
  // MCP からは書けない（またはその逆の）ねじれが残る
  // `budget` は権限モデル単純化で `sales` に統合済み
  record_finance_doc: { module: ['dailyops', 'sales'], level: 'editor' },
  record_inquiry: { module: 'dailyops', level: 'editor' },
  register_inview_attendee: { module: 'dailyops', level: 'editor' },
  submit_ops_report: { module: 'dailyops', level: 'editor' },
  add_ops_report_items: { module: 'dailyops', level: 'editor' },
  // セキュリティカードの貸出/返却 (v2.9.229 で追加された際に登録が漏れており、
  // OAuth 経由で dailyops 権限の無いユーザーでも実行できる状態だった。
  // HTTP 側 security-card.routes.ts の canEdit = requirePermission('dailyops','editor') と一致させる)
  lend_security_card: { module: 'dailyops', level: 'editor' },
  return_security_card: { module: 'dailyops', level: 'editor' },
  // 個人タスク・依頼・投入 (v2.9.245 / 改革 Phase 2a)。
  // 受け皿は日常業務アプリの「タスク・依頼」メニューなので module は dailyops に揃える
  // (HTTP 側 dailyops/tasks.routes.ts の requirePermission と一致させる)。
  // 注意: 「自分に割り当てられた案件タスクを読む」のは sales 権限を要求しない設計だが、
  // それは読み取り系 (list_my_tasks 等) なのでこの表の対象外。
  create_task_intake: { module: 'dailyops', level: 'editor' },
  commit_task_intake: { module: 'dailyops', level: 'editor' },
  discard_task_intake: { module: 'dailyops', level: 'editor' },
  create_delegation: { module: 'dailyops', level: 'editor' },
  respond_to_delegation: { module: 'dailyops', level: 'editor' },
  // studio (スタジオ予約カレンダー)。`studio` は権限モデル単純化で `sales` に統合済み
  create_studio_booking: { module: 'sales', level: 'editor' },
  // 制作資料 (production)。⚠️ このゲートは静的キーには効かない（isOAuth===false は即 return）。
  // 制作資料のツールは production.access.ts の requireProductionActor() が
  // 静的キーそのものを 403 で止める（05-mcp.md §3-1）。ここは OAuth actor の
  // qsheet 権限を見る二重の防御で、二重で正しい（gate.ts は OAuth のときだけ効く）。
  create_qsheet: { module: 'qsheet', level: 'editor' },
  propose_qsheet_draft: { module: 'qsheet', level: 'editor' },
  discard_qsheet_proposal: { module: 'qsheet', level: 'editor' },
};

const LEVEL_ORDER: Record<string, number> = { reader: 1, exporter: 1, editor: 2, manager: 3, owner: 3 };

/**
 * `module` は**配列も受ける**（どれか1つを満たせばよい）。
 * HTTP 側の `requireAnyPermission` と同じ考え方で、v4 で
 * 「受け取った書類は経理も日常業務も開ける」にしたのに合わせてある。
 */
async function actorHasPermission(
  userId: string,
  module: string | string[],
  minLevel: 'editor' | 'manager',
): Promise<boolean> {
  const user = (await queryOne('SELECT role FROM users WHERE id = ?', [userId])) as { role?: string } | null;
  if (!user) return false;
  if (user.role === 'system_admin') return true;
  const modules = Array.isArray(module) ? module : [module];
  const rows = (await queryAll(
    `SELECT access_level FROM user_permissions WHERE user_id = ? AND module IN (${modules.map(() => '?').join(', ')})`,
    [userId, ...modules],
  )) as Array<{ access_level: string }>;
  // **どれか1つでも足りていれば通す。** 行の順序に依存しないよう最大値で見る
  // (以前は `rows[0]` だけを見ており、複数モジュールでは結果が不定になる)
  return rows.some((r) => (LEVEL_ORDER[r.access_level] ?? 0) >= LEVEL_ORDER[minLevel]);
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
      const label = Array.isArray(need.module) ? need.module.join(' か ') : need.module;
      throw new Error(
        `権限が不足しています: ツール '${name}' には「${label}」モジュールの ${need.level} 以上の権限が必要です`,
      );
    }
  }
}
