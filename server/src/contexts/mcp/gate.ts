import { queryOne, queryAll } from '../../shared/db/connection';
import type { McpActor } from './helpers';

// MCP ツールの権限ゲート。
//
// mcpAuth は「認証」(静的APIキー or OAuthトークン検証) を行うが、OAuth 経由 (per-user)
// の actor がそのユーザーの ONAiR モジュール権限を持つかは検証していなかった。そのため
// 閲覧のみ / 権限なしの ONAiR アカウントでも OAuth ダンスを完走すれば MCP 経由で案件作成・
// GLS発番・見積確定・財務登録などが可能で、HTTP 側の requirePermission による権限モデルを
// 完全にバイパスしていた。このゲートで OAuth actor には対応モジュールの権限を要求する。
//
// - 静的 APIキー actor: フルアクセス運用鍵として素通り (docs/mcp-server.md 参照)。
// - OAuth actor: 書き込みツールは対応モジュールの editor/manager 権限
//   (`WRITE_TOOL_PERMISSIONS`) を、読み取りツールは reader 権限
//   (`READ_TOOL_PERMISSIONS`) を要求。
// - どちらの表にも無いツール (個人スコープの読み取り等) はゲートなし
//   (READ 表の冒頭の注意書き参照)。
//
// 各ツールの module / level は対応する HTTP ルートの requirePermission に揃えてある。

type ToolPermission = { module: string | string[]; level: 'reader' | 'editor' | 'manager' };

const WRITE_TOOL_PERMISSIONS: Record<string, ToolPermission> = {
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
  // かんばん列 (task_columns)。HTTP 側 (`task-columns.routes.ts`) の書き込みルートも
  // canEdit = requirePermission('sales','editor') を要求する (MCP 側と一致。
  // 以前は router 既定の reader のまま書き込めた)。
  create_task_column: { module: 'sales', level: 'editor' },
  update_task_column: { module: 'sales', level: 'editor' },
  reorder_task_columns: { module: 'sales', level: 'editor' },
  delete_task_column: { module: 'sales', level: 'editor' },
  apply_task_column_template: { module: 'sales', level: 'editor' },
  // プロジェクト管理 (GPM)。HTTP 側 (`gpm/index.ts`) の canEdit = requirePermission('sales','editor')
  // / canManage = requirePermission('sales','manager') と一致させる
  // (`gpm` は権限モデル単純化で `sales` に統合済み — `apps.ts` の permissionModule 参照)。
  create_gpm_project: { module: 'sales', level: 'editor' },
  update_gpm_project: { module: 'sales', level: 'editor' },
  delete_gpm_project: { module: 'sales', level: 'manager' },
  create_gpm_phase: { module: 'sales', level: 'editor' },
  update_gpm_phase: { module: 'sales', level: 'editor' },
  move_gpm_phase: { module: 'sales', level: 'editor' },
  delete_gpm_phase: { module: 'sales', level: 'editor' },
  create_gpm_task: { module: 'sales', level: 'editor' },
  update_gpm_task: { module: 'sales', level: 'editor' },
  delete_gpm_task: { module: 'sales', level: 'editor' },
  create_gpm_open_item: { module: 'sales', level: 'editor' },
  update_gpm_open_item: { module: 'sales', level: 'editor' },
  delete_gpm_open_item: { module: 'sales', level: 'editor' },
  add_gpm_member: { module: 'sales', level: 'editor' },
  update_gpm_member: { module: 'sales', level: 'editor' },
  remove_gpm_member: { module: 'sales', level: 'editor' },
  create_gpm_template: { module: 'sales', level: 'editor' },
  update_gpm_template: { module: 'sales', level: 'editor' },
  delete_gpm_template: { module: 'sales', level: 'manager' },
  reorder_gpm_members: { module: 'sales', level: 'editor' },
  create_gpm_estimate: { module: 'sales', level: 'editor' },
  update_gpm_estimate_items: { module: 'sales', level: 'editor' },
  approve_gpm_estimate: { module: 'sales', level: 'editor' },
  archive_gpm_estimate: { module: 'sales', level: 'editor' },
  unarchive_gpm_estimate: { module: 'sales', level: 'editor' },
  update_gpm_minutes: { module: 'sales', level: 'editor' },
  delete_gpm_minutes: { module: 'sales', level: 'manager' },
  create_gpm_box_folder: { module: 'sales', level: 'editor' },
  upsert_event_report: { module: 'sales', level: 'editor' },
  attach_event_photo: { module: 'sales', level: 'editor' },
  detach_event_photo: { module: 'sales', level: 'editor' },
  upsert_meeting_minutes: { module: 'sales', level: 'editor' },
  upsert_monthly_budget: { module: 'sales', level: 'editor' },
  upsert_monthly_actual_override: { module: 'sales', level: 'editor' },
  // dailyops (日常業務: 見積/請求書・問い合わせ・内覧会・週報/ニュース・セキュリティカード)
  // v4 ⑥: 受領書類は財務へ移し、HTTP 側を `dailyops` か `budget` の
  // **どちらか**で通すようにした (経理が 403 で開けなかった)。
  // **MCP 側も同じにする** — 片方だけ直すと、画面からは書けるのに
  // MCP からは書けない（またはその逆の）ねじれが残る
  // `budget` は権限モデル単純化で `sales` に統合済み
  record_finance_doc: { module: ['dailyops', 'sales'], level: 'editor' },
  record_inquiry: { module: 'dailyops', level: 'editor' },
  register_inview_attendee: { module: 'dailyops', level: 'editor' },
  update_inview_attendee: { module: 'dailyops', level: 'editor' },
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
  // 機材管理 (equipment)。⚠️ HTTP 側 (`equipment.routes.ts`) は `/lendings` 系ルートに
  // 個別の requirePermission を持たず router 既定の reader のまま書き込めるが、MCP 側は
  // 他カテゴリの書き込みツールと揃えて editor 以上を要求する (`equipment.tools.ts` 冒頭コメント参照)。
  lend_equipment: { module: 'equipment', level: 'editor' },
  return_equipment: { module: 'equipment', level: 'editor' },
  // 制作資料 (production)。⚠️ このゲートは静的キーには効かない（isOAuth===false は即 return）。
  // 制作資料のツールは production.access.ts の requireProductionActor() が
  // 静的キーそのものを 403 で止める（05-mcp.md §3-1）。ここは OAuth actor の
  // qsheet 権限を見る二重の防御で、二重で正しい（gate.ts は OAuth のときだけ効く）。
  // `module: 'qsheet'` は permissionModule（既存ユーザーの権限JSONのキー）で、
  // qsheet→techops移行では意図的に不変（他の Phase と同じ方針）。
  // ⚠️ qsheet→techops移行 Phase 4（2026-08-22）: ツール名を techops 系の新名へ改名し、
  // 旧名（`*_qsheet` 系）も同じ権限で二重登録した（MCP プロトコルにエイリアス機構が無いため）。
  // 新名だけ足して旧名を消すと、旧名を呼ぶ既存の外部エージェント連携が権限ゲート無しで
  // 通ってしまう（`enforceToolPermissions` は WRITE/READ どちらの表にも無いツールを
  // 無条件でゲート無しとして扱うため）。撤去する場合は両方を同時に外すこと。
  create_sheet: { module: 'qsheet', level: 'editor' },
  create_qsheet: { module: 'qsheet', level: 'editor' },
  propose_sheet_draft: { module: 'qsheet', level: 'editor' },
  propose_qsheet_draft: { module: 'qsheet', level: 'editor' },
  discard_sheet_proposal: { module: 'qsheet', level: 'editor' },
  discard_qsheet_proposal: { module: 'qsheet', level: 'editor' },
  // スケジュール表そのもの CRUD。HTTP 側 (`schedules.routes.ts`) の
  // requirePermission('qsheet', 'editor') と揃えてある。
  create_schedule: { module: 'qsheet', level: 'editor' },
  update_schedule: { module: 'qsheet', level: 'editor' },
  // スケジュール表の列 CRUD ＋ 並べ替え。HTTP 側 (`schedule-columns.routes.ts`) の
  // requirePermission('qsheet', 'editor') と揃えてある。
  create_schedule_column: { module: 'qsheet', level: 'editor' },
  update_schedule_column: { module: 'qsheet', level: 'editor' },
  delete_schedule_column: { module: 'qsheet', level: 'editor' },
  reorder_schedule_columns: { module: 'qsheet', level: 'editor' },
  // スケジュール表の枠 CRUD。HTTP 側 (`schedule-items.routes.ts`) の
  // requirePermission('qsheet', 'editor') と揃えてある。
  create_schedule_item: { module: 'qsheet', level: 'editor' },
  update_schedule_item: { module: 'qsheet', level: 'editor' },
  delete_schedule_item: { module: 'qsheet', level: 'editor' },
};

// MCP 読み取りツールの権限ゲート。HTTP 側では list/get 系にも requirePermission(module)
// = reader が掛かっているのに、OAuth actor の読み取りツールは素通りだった（権限ゼロの
// ONAiR アカウントでも OAuth を完走すれば list_revenues / get_monthly_summary /
// list_customers 等で財務・損益・顧客データを読めた — v3.2.2 で `GET /search` に塞いだのと
// 同じ形の穴）。各ツールの module は対応する HTTP ルートの requirePermission に揃えてある。
//
// 意図してこの表に載せないもの（= ゲートなしのまま）:
// - 個人スコープの読み取り (list_my_tasks / list_my_delegations / get_my_task_summary /
//   list_task_intakes / get_task_intake): 「自分に割り当てられたタスクを読む」に
//   モジュール権限を要求しない設計（WRITE 表のタスク・依頼・投入の注意書き参照）。
// - list_users: 担当者名 → users.id の解決に全カテゴリのツールが前提として使う。
// - get_ai_feedback_digest: 取込スキルが実行前に必ず読む契約のため（docs/mcp-server.md）。
const READ_TOOL_PERMISSIONS: Record<string, ToolPermission> = {
  // sales (案件・顧客・営業活動・タスク・担当・スタジオ・財務・予算・料金表・分析・keep-report)
  list_projects: { module: 'sales', level: 'reader' },
  get_project: { module: 'sales', level: 'reader' },
  list_customers: { module: 'sales', level: 'reader' },
  get_customer: { module: 'sales', level: 'reader' },
  list_activity_logs: { module: 'sales', level: 'reader' },
  list_overdue_actions: { module: 'sales', level: 'reader' },
  list_tasks: { module: 'sales', level: 'reader' },
  list_task_dependencies: { module: 'sales', level: 'reader' },
  list_task_columns: { module: 'sales', level: 'reader' },
  list_task_column_templates: { module: 'sales', level: 'reader' },
  list_project_members: { module: 'sales', level: 'reader' },
  list_studio_rooms: { module: 'sales', level: 'reader' },
  list_studio_bookings: { module: 'sales', level: 'reader' },
  get_studio_availability: { module: 'sales', level: 'reader' },
  get_monthly_summary: { module: 'sales', level: 'reader' },
  list_revenues: { module: 'sales', level: 'reader' },
  list_purchases: { module: 'sales', level: 'reader' },
  list_sga: { module: 'sales', level: 'reader' },
  get_monthly_budget: { module: 'sales', level: 'reader' },
  get_monthly_pl: { module: 'sales', level: 'reader' },
  list_pricing: { module: 'sales', level: 'reader' },
  get_project_simulation: { module: 'sales', level: 'reader' },
  get_sales_funnel: { module: 'sales', level: 'reader' },
  get_sales_performance: { module: 'sales', level: 'reader' },
  get_lost_reason_analysis: { module: 'sales', level: 'reader' },
  get_event_report: { module: 'sales', level: 'reader' },
  list_event_reports: { module: 'sales', level: 'reader' },
  get_meeting_minutes: { module: 'sales', level: 'reader' },
  list_meeting_minutes: { module: 'sales', level: 'reader' },
  // プロジェクト管理 (GPM)。HTTP 側 (`gpm/index.ts`) の canRead = requirePermission('sales','reader') と一致
  list_gpm_projects: { module: 'sales', level: 'reader' },
  get_gpm_project: { module: 'sales', level: 'reader' },
  list_gpm_tasks: { module: 'sales', level: 'reader' },
  list_gpm_open_items: { module: 'sales', level: 'reader' },
  list_gpm_templates: { module: 'sales', level: 'reader' },
  list_gpm_estimates: { module: 'sales', level: 'reader' },
  get_gpm_estimate: { module: 'sales', level: 'reader' },
  get_gpm_estimate_summary: { module: 'sales', level: 'reader' },
  list_gpm_minutes: { module: 'sales', level: 'reader' },
  get_gpm_minutes: { module: 'sales', level: 'reader' },
  get_gpm_box_folder_preview: { module: 'sales', level: 'reader' },
  list_gpm_box_files: { module: 'sales', level: 'reader' },
  // dailyops (週報・内覧会・問い合わせ・セキュリティカード)
  list_ops_reports: { module: 'dailyops', level: 'reader' },
  get_ops_report: { module: 'dailyops', level: 'reader' },
  get_weekly_activity_stats: { module: 'dailyops', level: 'reader' },
  list_inview_attendees: { module: 'dailyops', level: 'reader' },
  list_inview_sessions: { module: 'dailyops', level: 'reader' },
  list_inquiries: { module: 'dailyops', level: 'reader' },
  list_security_cards: { module: 'dailyops', level: 'reader' },
  get_security_card: { module: 'dailyops', level: 'reader' },
  list_security_card_lendings: { module: 'dailyops', level: 'reader' },
  // 受領書類。HTTP 側 (`inbox.routes.ts`) の docsRead =
  // requireAnyPermission(['dailyops','sales'],'reader') と一致 (record_finance_doc と同じ判断)
  list_finance_docs: { module: ['dailyops', 'sales'], level: 'reader' },
  // 束（見積書→発注書→請求書のひとつづり）。**中身は list_finance_docs と同じもの**
  // なので同じ権限。⚠️ 表に足し忘れると、`enforceToolPermissions` は
  // どちらの表にも無いツールを素通りさせるので、**権限が1つも無い利用者でも
  // 取引先・案件・金額・支払期日・BOX の在り処まで読めます**（Codex 指摘・High）
  list_finance_doc_groups: { module: ['dailyops', 'sales'], level: 'reader' },
  // 隔週キープの定例報告パック（2026-09 新設）。HTTP 側 (`keep.routes.ts`) の canRead =
  // requireAnyPermission(['dailyops','sales'],'reader') と一致（財務の数字なので営業・経理も読む）
  get_keep_report_pack: { module: ['dailyops', 'sales'], level: 'reader' },
  list_keep_report_packs: { module: ['dailyops', 'sales'], level: 'reader' },
  // 機材管理 (equipment)。HTTP 側 (`equipment.routes.ts`) の router 既定 reader と一致
  list_equipment: { module: 'equipment', level: 'reader' },
  get_equipment: { module: 'equipment', level: 'reader' },
  list_equipment_lendings: { module: 'equipment', level: 'reader' },
  list_inventory_checks: { module: 'equipment', level: 'reader' },
  get_inventory_check: { module: 'equipment', level: 'reader' },
  // 制作技術支援 (production)。文書単位の秘匿は `production.access.ts` の
  // requireProductionActor() が判定する — ここは書き込みツールと同じ二重の防御で、
  // HTTP 側 (`qsheet/routes/*`) の router 既定 requirePermission('qsheet') = reader に揃える。
  // 旧名 (`*_qsheet` 系) も WRITE 表と同じ理由で二重登録（撤去は両方同時に）。
  list_production_docs: { module: 'qsheet', level: 'reader' },
  get_production_journey: { module: 'qsheet', level: 'reader' },
  get_sheet: { module: 'qsheet', level: 'reader' },
  get_qsheet: { module: 'qsheet', level: 'reader' },
  get_day_schedule: { module: 'qsheet', level: 'reader' },
  find_similar_sheets: { module: 'qsheet', level: 'reader' },
  find_similar_qsheets: { module: 'qsheet', level: 'reader' },
};

const LEVEL_ORDER: Record<string, number> = { reader: 1, exporter: 1, editor: 2, manager: 3, owner: 3 };

/**
 * `module` は**配列も受ける**（どれか1つを満たせばよい）。
 * HTTP 側の `requireAnyPermission` と同じ考え方で、v4 で
 * 「受領書類は経理も日常業務も開ける」にしたのに合わせてある。
 */
async function actorHasPermission(
  userId: string,
  module: string | string[],
  minLevel: ToolPermission['level'],
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
 * tools/call のツール (書き込み・読み取り両方) に対し OAuth actor のモジュール権限を検証する。
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
    const need = WRITE_TOOL_PERMISSIONS[name] ?? READ_TOOL_PERMISSIONS[name];
    if (!need) continue; // 両表に無いツール (個人スコープの読み取り等) はゲートなし
    const allowed = await actorHasPermission(actor.actorId, need.module, need.level);
    if (!allowed) {
      const label = Array.isArray(need.module) ? need.module.join(' か ') : need.module;
      throw new Error(
        `権限が不足しています: ツール '${name}' には「${label}」モジュールの ${need.level} 以上の権限が必要です`,
      );
    }
  }
}
