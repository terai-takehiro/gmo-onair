// 日常業務アプリの型・定数

export type OpsReportKind = 'weekly_activity' | 'daily_news';
export type OpsReportStatus = 'draft' | 'published';

export interface OpsReportItem {
  id: string;
  report_id: string;
  category: string | null;
  content: string;
  note: string | null;
  url: string | null;
  ai_related: boolean | null;
  pick: number | null;
  recorded_by: string | null;
  source: 'ai' | 'human';
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface OpsReport {
  id: string;
  kind: OpsReportKind;
  period_key: string;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  status: OpsReportStatus;
  requested_by: string | null;
  created_by: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  items?: OpsReportItem[];
  item_count?: number;
}

// ── 内覧会 来場予約 ──────────────────────────────────
export interface InviewRegistration {
  id: string;
  session_label: string;
  session_date: string | null;
  session_time: string | null;
  session_audience: string | null;
  name: string;
  furigana: string | null;
  email: string | null;
  company: string | null;
  role: string | null;
  postal_code: string | null;
  address: string | null;
  phone: string | null;
  fax: string | null;
  mobile: string | null;
  mail_consent: boolean | null;
  party_size: number;
  companions: string[] | null;
  visit_time: string | null;
  interests: string | null;
  notes: string | null;
  source: string;
  checked_in_at: string | null;
  checked_in_by: string | null;
  requested_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InviewSession {
  session_date: string | null;
  session_label: string;
  session_time: string | null;
  session_audience: string | null;
  registration_count: number;
  total_headcount: number;
  checked_in_count: number;
}

/** ホームのメニュー定義 — 今後の小メニュー追加はこの配列に 1 行足してページを作るだけ */
export interface DailyMenu {
  kind: OpsReportKind;
  label: string;
  description: string;
  path: string;
  icon: string; // lucide icon name
}

export const MENUS: DailyMenu[] = [
  {
    kind: 'weekly_activity',
    label: 'ウィークリー活動報告',
    description: 'AI が週次の活動データを集計・文章化。トピックを追記して確定',
    path: '/weekly',
    icon: 'CalendarCheck',
  },
  {
    kind: 'daily_news',
    label: 'デイリーニュース報告',
    description: 'AI が業界ニュースを日次収集。カテゴリ・採用フラグで管理',
    path: '/news',
    icon: 'Newspaper',
  },
];

/** ニュースのカテゴリ (既存 Excel「記入表」準拠、datalist で自由入力も可) */
export const NEWS_CATEGORIES = ['LED', '照明', '映像', '音声', '配信', 'コンテンツ', 'スタジオ', 'AR/XR', 'その他'];

/** 週次トピックスのカテゴリ (既存 Excel「週次トピックス」準拠) */
export const WEEKLY_CATEGORIES = [
  'グループへの技術支援', 'イベント', 'セールス・マーケティング',
  '技術内製化', '技術高度化', 'AI活用', 'その他',
];

export const STAGE_LABELS: Record<string, string> = {
  neta: 'ネタ',
  d_hold: 'D 仮押さえ',
  c_proposal: 'C 見積提案',
  b_verbal: 'B 口頭決定',
  a_won: 'A 受注済',
  s_completed: 'S 案件終了',
  e_lost: 'E 失注',
};

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  call: '電話',
  email: 'メール',
  meeting: '打合せ',
  visit: '訪問',
  proposal: '提案',
  demo: 'デモ',
  followup: 'フォロー',
  follow_up: 'フォロー',
  other: 'その他',
};

/** 'YYYY-MM-DD' → 'M/D (曜)' */
export function formatDateJa(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()} (${dow})`;
}

/** 週の表示ラベル: '7/6 (月) 〜 7/12 (日) の週' */
export function formatWeekJa(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00`);
  if (Number.isNaN(d.getTime())) return weekStart;
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  return `${d.getMonth() + 1}/${d.getDate()} 〜 ${end.getMonth() + 1}/${end.getDate()} の週`;
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function formatYen(n: number): string {
  if (Math.abs(n) >= 10000) return `¥${Math.round(n / 10000).toLocaleString()}万`;
  return `¥${n.toLocaleString()}`;
}
