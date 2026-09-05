import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

// 日常業務アプリ (dailyops) — フィードバックチケット（GMO ONAiR 自体への要望・不具合報告）の service 層。
// 起票は全ユーザー、対応状況の更新は editor（ルート側の権限分けは feedback-ticket.routes.ts）。

// `shared/src/client/apps.ts` のアプリ登録に合わせた固定値。増えたら両側に1行足す。
export const TARGET_APPS = [
  { key: 'client', label: '案件管理・財務管理・カレンダー・設定' },
  { key: 'daily', label: '日常業務' },
  { key: 'equipment', label: '機材管理' },
  { key: 'techops', label: '制作技術支援' },
  { key: 'live', label: '計時・視聴者' },
  { key: 'awards', label: 'リアルタイムCG' },
  { key: 'shared', label: '共通（複数アプリにまたがる）' },
  { key: 'other', label: 'その他' },
] as const;
export type TargetApp = (typeof TARGET_APPS)[number]['key'];
const TARGET_APP_KEYS = TARGET_APPS.map((a) => a.key) as string[];

/**
 * `target_app` ごとの画面・機能の一覧（2段目の選択肢）。
 *
 * **左メニューの項目名をそのまま使う**（各アプリの `components/layout/nav.ts`）。
 * ルートの列挙ではなく「利用者が普段その画面を呼ぶ名前」にすることで、
 * URL を知らない起票者でも選べる。`techops` は案件ごとに出し分ける動的なメニューなので、
 * ここでは `client-daily/CLAUDE.md` のブロックアプリ表にある機能単位（台本作成・本番進行
 * など）に丸めてある。**どのアプリも最後は「その他 / 分からない」で締める**
 * （一覧に無い画面を報告できなくなるのを防ぐ）。
 *
 * 新しい画面を足したら、ここにも1行足すこと（無くても起票自体は「その他」で通る）。
 */
export const PAGES_BY_APP: Record<TargetApp, { key: string; label: string }[]> = {
  client: [
    { key: 'sales_dashboard', label: '営業：ダッシュボード' },
    { key: 'sales_projects', label: '営業：案件一覧' },
    { key: 'sales_tasks', label: '営業：タスク一覧' },
    { key: 'sales_billing', label: '営業：見積・請求' },
    { key: 'sales_ledger', label: '営業：案件台帳' },
    { key: 'sales_activity_logs', label: '営業：営業活動記録' },
    { key: 'sales_project_groups', label: '営業：費用を分け合うグループ' },
    { key: 'sales_pricing', label: '営業：料金表' },
    { key: 'sales_companies', label: '営業：取引先マスター' },
    { key: 'sales_flow_templates', label: '営業：標準工程テンプレート' },
    { key: 'gpm_dashboard', label: 'プロジェクト管理：ダッシュボード' },
    { key: 'gpm_projects', label: 'プロジェクト管理：プロジェクト一覧' },
    { key: 'gpm_tasks', label: 'プロジェクト管理：やること（未確認事項）' },
    { key: 'gpm_templates', label: 'プロジェクト管理：標準工程テンプレート' },
    { key: 'budget_dashboard', label: '財務管理：財務ダッシュボード' },
    { key: 'budget_billing', label: '財務管理：請求・入金' },
    { key: 'budget_revenues', label: '財務管理：売上' },
    { key: 'budget_purchases', label: '財務管理：仕入' },
    { key: 'budget_sga', label: '財務管理：販管費' },
    { key: 'budget_documents', label: '財務管理：受け取った書類' },
    { key: 'budget_import', label: '財務管理：取り込み' },
    { key: 'budget_vendors', label: '財務管理：取引先（仕入先・パートナー）' },
    { key: 'budget_vendor_reports', label: '財務管理：仕入先集計' },
    { key: 'calendar_main', label: 'カレンダー：予定' },
    { key: 'calendar_rooms', label: 'カレンダー：部屋の空き' },
    { key: 'calendar_holds', label: 'カレンダー：仮押さえ' },
    { key: 'calendar_duplicates', label: 'カレンダー：重複疑い' },
    { key: 'calendar_settings', label: 'カレンダー：カレンダーの設定' },
    { key: 'settings_main', label: '設定：設定' },
    { key: 'settings_sites', label: '設定：拠点・部屋' },
    { key: 'settings_users', label: '設定：権限とメンバー' },
    { key: 'settings_ai_activity', label: '設定：AIの活動' },
    { key: 'settings_data_viewer', label: '設定：データビューア' },
    { key: 'settings_db_backups', label: '設定：DBバックアップ' },
    { key: 'settings_system', label: '設定：システムの情報' },
    { key: 'other', label: 'その他 / 分からない' },
  ],
  daily: [
    { key: 'home', label: 'ホーム' },
    { key: 'tasks', label: 'タスク・依頼' },
    { key: 'weekly', label: 'ウィークリー活動報告' },
    { key: 'news', label: 'デイリーニュース報告' },
    { key: 'inquiries', label: '入ってきた情報' },
    { key: 'finance_docs', label: '受け取った書類' },
    { key: 'inview', label: '内覧会 来場予約' },
    { key: 'security_cards', label: 'セキュリティカード' },
    { key: 'feedback_tickets', label: 'フィードバックチケット' },
    { key: 'search', label: '探す' },
    { key: 'other', label: 'その他 / 分からない' },
  ],
  equipment: [
    { key: 'dashboard', label: 'ダッシュボード' },
    { key: 'items', label: '機材台帳' },
    { key: 'racks', label: 'ラック図' },
    { key: 'maintenance', label: 'メンテナンス' },
    { key: 'inventory', label: '棚卸し' },
    { key: 'scan', label: 'QRスキャン' },
    { key: 'lendings', label: '貸出・返却' },
    { key: 'rental_search', label: 'レンタル機材検索' },
    { key: 'settings', label: '設定' },
    { key: 'other', label: 'その他 / 分からない' },
  ],
  techops: [
    { key: 'top', label: 'トップ' },
    { key: 'sheet', label: '台本作成（シート）' },
    { key: 'schedule', label: '香盤（スケジュール）' },
    { key: 'onair', label: '本番進行（OnAir・ランダウン・プロンプター・音声サポート）' },
    { key: 'recording', label: '収録設定' },
    { key: 'streaming', label: '配信設定' },
    { key: 'rental', label: 'レンタル' },
    { key: 'graphics', label: 'グラフィックス' },
    { key: 'liveops', label: '計時・視聴者（ミニアプリ）' },
    { key: 'ai_knowledge', label: 'AIナレッジの承認' },
    { key: 'other', label: 'その他 / 分からない' },
  ],
  live: [
    { key: 'ops', label: '計時・視聴者（運用画面）' },
    { key: 'timers', label: 'タイマー管理' },
    { key: 'program_settings', label: '番組設定' },
    { key: 'org_settings', label: '組織の鍵設定' },
    { key: 'display', label: '表示画面（/live/display/）' },
    { key: 'other', label: 'その他 / 分からない' },
  ],
  awards: [
    { key: 'events', label: '演出・送出' },
    { key: 'other', label: 'その他 / 分からない' },
  ],
  shared: [
    { key: 'shell', label: '共通シェル（上辺バー・左メニュー・スマホ下タブ）' },
    { key: 'ui_components', label: '共通UI部品（ボタン・入力欄・一覧の行 など）' },
    { key: 'tokens', label: 'デザイントークン・書体' },
    { key: 'other', label: 'その他 / 分からない' },
  ],
  other: [
    { key: 'other', label: 'その他 / 分からない' },
  ],
};

export const CATEGORIES = [
  { key: 'bug', label: '不具合' },
  { key: 'feature', label: '要望' },
  { key: 'other', label: 'その他' },
] as const;
export type Category = (typeof CATEGORIES)[number]['key'];
const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as string[];

export const STATUSES = [
  { key: 'open', label: '未対応' },
  { key: 'in_progress', label: '対応中' },
  { key: 'resolved', label: '対応済み' },
  { key: 'rejected', label: '却下' },
] as const;
export type Status = (typeof STATUSES)[number]['key'];
const STATUS_KEYS = STATUSES.map((s) => s.key) as string[];

export interface CreateTicketInput {
  title: string;
  description: string;
  target_app: string;
  target_page: string;
  category?: string | null;
  reporter_id: string;
  reporter_name: string;
}

export interface UpdateStatusInput {
  status: string;
  response_note?: string | null;
}

const SELECT = `SELECT id, title, description, target_app, target_page, category, status,
  reporter_id, reporter_name, response_note, resolved_at, created_at, updated_at
  FROM feedback_tickets`;

export const feedbackTicketService = {
  /** 一覧 (状態/対象アプリ/種別/検索で絞り込み)。新しい起票順。 */
  async list(filter: { status?: string; target_app?: string; category?: string; search?: string } = {}): Promise<Record<string, unknown>[]> {
    const conds: string[] = [];
    const params: unknown[] = [];
    if (filter.status && STATUS_KEYS.includes(filter.status)) { conds.push('status = ?'); params.push(filter.status); }
    if (filter.target_app && TARGET_APP_KEYS.includes(filter.target_app)) { conds.push('target_app = ?'); params.push(filter.target_app); }
    if (filter.category && CATEGORY_KEYS.includes(filter.category)) { conds.push('category = ?'); params.push(filter.category); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = await queryAll(`${SELECT} ${where} ORDER BY created_at DESC`, params);
    if (!filter.search) return rows;
    const q = filter.search.toLowerCase();
    return rows.filter((r) =>
      String(r.title).toLowerCase().includes(q) || String(r.description).toLowerCase().includes(q));
  },

  async get(id: string): Promise<Record<string, unknown> | undefined> {
    return queryOne(`${SELECT} WHERE id = ?`, [id]);
  },

  /** 起票。全ユーザーが行える (呼び出し側 = ルートで reader 以上を確認済み)。 */
  async create(input: CreateTicketInput): Promise<Record<string, unknown>> {
    const title = (input.title ?? '').trim();
    if (!title) throw new AppError(400, 'VALIDATION_ERROR', '題名を入れてください');
    const description = (input.description ?? '').trim();
    if (!description) throw new AppError(400, 'VALIDATION_ERROR', '内容を入れてください');
    if (!TARGET_APP_KEYS.includes(input.target_app)) {
      throw new AppError(400, 'VALIDATION_ERROR', '対象アプリの指定が正しくありません');
    }
    const pages = PAGES_BY_APP[input.target_app as TargetApp];
    if (!pages.some((p) => p.key === input.target_page)) {
      throw new AppError(400, 'VALIDATION_ERROR', '対象の画面・機能の指定が正しくありません');
    }
    const category = input.category && CATEGORY_KEYS.includes(input.category) ? input.category : 'other';

    const id = uuidv4();
    await execute(
      `INSERT INTO feedback_tickets
         (id, title, description, target_app, target_page, category, status, reporter_id, reporter_name)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
      [id, title, description, input.target_app, input.target_page, category, input.reporter_id, input.reporter_name],
    );
    return (await this.get(id))!;
  },

  /** 対応状況の更新 (対応中にする/対応済みにする/却下する)。editor のみ (ルート側で確認済み)。 */
  async updateStatus(id: string, input: UpdateStatusInput): Promise<Record<string, unknown>> {
    const existing = await this.get(id);
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'チケットが見つかりません');
    if (!STATUS_KEYS.includes(input.status)) {
      throw new AppError(400, 'VALIDATION_ERROR', '対応状況の指定が正しくありません');
    }
    const resolvedNow = input.status === 'resolved' || input.status === 'rejected';
    await execute(
      `UPDATE feedback_tickets
         SET status = ?, response_note = ?, resolved_at = ${resolvedNow ? 'NOW()' : 'NULL'}, updated_at = NOW()
       WHERE id = ?`,
      [input.status, input.response_note ?? existing.response_note ?? null, id],
    );
    return (await this.get(id))!;
  },

  /** 状態ごとの件数 (絞り込みチップ用)。 */
  async counts(): Promise<Record<Status, number> & { all: number }> {
    const rows = await queryAll(`SELECT status, COUNT(*)::int AS n FROM feedback_tickets GROUP BY status`, []);
    const out = { all: 0, open: 0, in_progress: 0, resolved: 0, rejected: 0 };
    for (const r of rows) {
      const key = String(r.status) as Status;
      if (key in out) out[key] = Number(r.n);
      out.all += Number(r.n);
    }
    return out;
  },
};
