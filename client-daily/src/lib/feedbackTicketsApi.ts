import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import api from './api';

// フィードバックチケット（GMO ONAiR 自体への要望・不具合報告）API の react-query フック集 + 型・定数。
// サーバー (feedback-ticket.service の TARGET_APPS/CATEGORIES/STATUSES) と揃える。

export interface TargetAppDef { key: string; label: string }
export const TARGET_APPS: TargetAppDef[] = [
  { key: 'client', label: '案件管理・財務管理・カレンダー・設定' },
  { key: 'daily', label: '日常業務' },
  { key: 'equipment', label: '機材管理' },
  { key: 'techops', label: '制作技術支援' },
  { key: 'live', label: '計時・視聴者' },
  { key: 'awards', label: 'リアルタイムCG' },
  { key: 'shared', label: '共通（複数アプリにまたがる）' },
  { key: 'other', label: 'その他' },
];
export const TARGET_APP_LABEL: Record<string, string> = Object.fromEntries(TARGET_APPS.map((a) => [a.key, a.label]));

/**
 * 一覧の列・バッジ用の短い呼び名（`docs/... のブロックアプリ一覧`表と同じ言い方）。
 * `TARGET_APP_LABEL` の `client` は「案件管理・財務管理・カレンダー・設定」と長く、
 * プルダウンでは正確さのために全部出すが、狭い列に並べると桁が揃わない。
 */
export const TARGET_APP_SHORT_LABEL: Record<string, string> = {
  client: '案件管理',
  daily: '日常業務',
  equipment: '機材管理',
  techops: '制作技術支援',
  live: '計時・視聴者',
  awards: 'リアルタイムCG',
  shared: '共通',
  other: 'その他',
};

export interface PageDef { key: string; label: string }

/**
 * `target_app` ごとの画面・機能の一覧（2段目のプルダウン）。
 * **サーバー (`feedback-ticket.service.ts` の `PAGES_BY_APP`) と揃える。**
 * 左メニューの項目名をそのまま使っている（詳しい理由はサーバー側のコメント）。
 */
export const PAGES_BY_APP: Record<string, PageDef[]> = {
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

/** `target_app` + `target_page` から表示ラベルを引く。無ければキーをそのまま出す */
export function pageLabel(targetApp: string, targetPage: string): string {
  return PAGES_BY_APP[targetApp]?.find((p) => p.key === targetPage)?.label ?? targetPage;
}

export type Category = 'bug' | 'feature' | 'other';
export const CATEGORY_LABELS: Record<Category, string> = { bug: '不具合', feature: '要望', other: 'その他' };

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'rejected';
export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: '未対応', in_progress: '対応中', resolved: '対応済み', rejected: '却下',
};
/** バッジの色。状態の意味に沿わせる（未対応=情報／対応中=注意／対応済み=成功／却下=危険） */
export const STATUS_TONE: Record<TicketStatus, string> = {
  open: 'border-info-border bg-info-surface text-info',
  in_progress: 'border-warning-border bg-warning-surface text-warning',
  resolved: 'border-success-border bg-success-surface text-success',
  rejected: 'border-destructive-border bg-destructive-surface text-destructive',
};

export interface FeedbackTicket {
  id: string;
  title: string;
  description: string;
  target_app: string;
  target_page: string;
  category: Category;
  status: TicketStatus;
  reporter_id: string;
  reporter_name: string;
  response_note: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketCounts {
  all: number; open: number; in_progress: number; resolved: number; rejected: number;
  /** 対象アプリごとの総数（絞り込みチップ用）。一覧は上限つきなので、件数はここから読む */
  byTargetApp: Record<string, number>;
}

export interface CreateTicketInput {
  title: string;
  description: string;
  target_app: string;
  target_page: string;
  category: Category;
}

export interface UpdateStatusInput {
  status: TicketStatus;
  response_note?: string | null;
}

const KEY = 'feedback-tickets';

export function useFeedbackTickets(filter: { status?: string; target_app?: string; category?: string; search?: string; limit?: number } = {}) {
  return useQuery<FeedbackTicket[]>({
    queryKey: [KEY, 'list', filter.status ?? 'all', filter.target_app ?? 'all', filter.category ?? 'all', filter.search ?? '', filter.limit ?? 'default'],
    // **前回の結果を出したまま次を取りに行く**（`limit` が絞り込みチップと同じく
    // 問い合わせの鍵に入っているため、「さらに読み込む」を押すたびに鍵が変わり、
    // 何もしないと一覧がいったん空になってスケルトンに戻ってしまう）
    placeholderData: keepPreviousData,
    // **絞り込みを変えるたびに前の問い合わせを打ち切る**。打ち切らないと、
    // 検索中に何度も打鍵したときに古い問い合わせがサーバー・DB の接続を
    // 使い続けたまま走り続ける（結果はもう画面に出せないのに）
    queryFn: ({ signal }) =>
      api.get('/dailyops/feedback-tickets', { params: filter, signal }).then((r) => r.data.data as FeedbackTicket[]),
    refetchOnMount: 'always',
  });
}

export function useFeedbackTicketCounts() {
  return useQuery({
    queryKey: [KEY, 'counts'],
    queryFn: () => api.get('/dailyops/feedback-tickets/counts').then((r) => r.data.data as TicketCounts),
    refetchOnMount: 'always',
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [KEY] });
}

export function useCreateFeedbackTicket() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateTicketInput) =>
      api.post('/dailyops/feedback-tickets', input).then((r) => r.data.data as FeedbackTicket),
    onSuccess: invalidate,
  });
}

export function useUpdateTicketStatus() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStatusInput }) =>
      api.patch(`/dailyops/feedback-tickets/${id}/status`, input).then((r) => r.data.data as FeedbackTicket),
    onSuccess: invalidate,
  });
}
