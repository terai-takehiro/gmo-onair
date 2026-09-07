import { compactYen } from '@gmo-onair/shared/src/client/ui/numbers';
import type { RichBlock } from '@gmo-onair/shared/src/client-v4/richContent';
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
  /** この行の元になった行 (デイリーニュース → 週報)。手で書いた行は null */
  source_item_id?: string | null;
  /** この行はもう週報へ送ったか (ニュース側だけが持つ・migration 167) */
  sent_to_weekly?: boolean;
  /**
   * 送り先（この行の日付が属する週）の週報が確定済みか。
   * 月表示（`GET /dailyops/reports/items-by-month`）だけが計算して持たせる —
   * 月をまたぐと行ごとに送り先の週が違うため、ページ単位の1つの値では表せない。
   */
  weekly_locked?: boolean;
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
  /** この環境で AI 下書き（ウィークリー活動報告）が使えるか。`GET /reports/:id` だけが埋める */
  ai_available?: boolean;
}

/**
 * デイリーニュース報告の月表示 — 1日ぶんのまとまり
 * (`GET /dailyops/reports/items-by-month`)。
 * その日のレポート自体が無い日（1件も書かれていない日）は含まれない。
 */
export interface OpsReportDayGroup {
  report_id: string;
  period_key: string;
  status: OpsReportStatus;
  reviewed_at: string | null;
  reviewed_by: string | null;
  items: OpsReportItem[];
}

// ── 内覧会 来場予約 ──────────────────────────────────
export interface InviewCompanion {
  id?: string;
  name: string;
  checked_in_at?: string | null;
  checked_in_by?: string | null;
}

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
  // migration 154 で「氏名の文字列」から オブジェクト に変わった。
  // この版の画面は同行者ごとの受付を持たないが、**描画・書き出しでは氏名だけを使う**。
  // 文字列のまま残っている行もあり得るので両方受ける (オブジェクトをそのまま
  // JSX に置くと React error #31 で画面が落ちる)。
  companions: (string | InviewCompanion)[] | null;
  visit_time: string | null;
  interests: string | null;
  notes: string | null;
  source: string;
  checked_in_at: string | null;
  checked_in_by: string | null;
  promoted_project_id: string | null;
  promoted_at: string | null;
  promoted_by: string | null;
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

/*
  ── 受領書類（`finance_docs`）の型はここには置かない ──────────
  画面は財務管理（`client/src/contexts/finance/pages/documents/`）にあり、
  型もそちらの `documents/types.ts` が持っている。ここにあった写しは
  **どこからも使われていなかった**（読む画面がこのアプリに無いため）。
  写しを残すと、片方だけ列が増えて食い違う。
*/

// ── その他問い合わせ ──────────────────────────────
export type Importance = 'high' | 'medium' | 'low';
export interface MiscInquiry {
  id: string;
  sender: string | null;
  subject: string | null;
  summary: string;
  category: string | null;
  importance: Importance;
  action_needed: string | null;
  url: string | null;
  received_at: string | null;
  handled_at: string | null;
  handled_by: string | null;
  notes: string | null;
  source: string;
  /**
   * AI が組み立てた「読める形」の中身（migration 160）。
   * **`summary` を置き換えるものではない** — 古い行は自由文しか持っていないので両方出す。
   */
  details: RichBlock[] | null;
  /** メール本文の全文。切り詰めていない */
  body_text: string | null;
  /** 行き先（migration 171）。**絞り込みはこれだけを見る**（`handled_at` は記録） */
  state: InquiryState;
  /**
   * 「保留」を机に戻す日（migration 247）。
   *
   * ⚠️ **これが無いと「保留」は見送りと同じ**です（どちらも「未処理から消えて
   * 二度と出てこない」で終わる）。この日が来たものは未処理と同じ扱いで
   * 「今日さばくもの」に入ります。空（決めていない）も同じ扱いです。
   */
  stock_review_on: string | null;
  tags: string[];
  /** タスクにしたときに作った案件管理のタスク */
  task_id: string | null;
  task_title: string | null;
  task_due_at: string | null;
  task_done: boolean | null;
  /** 案件の受付へ送って出来た案件 */
  project_id: string | null;
  project_name: string | null;
  project_stage: string | null;
  /**
   * AI が取り込んだ行か。**`source` では判定しない** —
   * あれは出どころ（メール／Slack）であって、誰が入れたかではない
   */
  is_ai: boolean;
  created_at: string;
  updated_at: string;
}
export const IMPORTANCE_LABELS: Record<Importance, string> = { high: '高', medium: '中', low: '低' };

/** 行き先（モックの4タブ ＋「案件」）。並びはそのままタブの並び。**表示名だけ・キーは変えない** */
export const INQUIRY_STATES = ['unsorted', 'stock', 'ticket', 'project', 'dropped'] as const;
export type InquiryState = (typeof INQUIRY_STATES)[number];
export const INQUIRY_STATE_LABELS: Record<InquiryState, string> = {
  unsorted: '未処理', stock: '保留', ticket: 'タスク', project: '案件', dropped: '見送り',
};

/** 出どころ。`manual` は**出どころが分からない既存行**（新規では入らない） */
export const INQUIRY_SOURCES = ['mail', 'slack', 'phone', 'talk'] as const;
export type InquirySource = (typeof INQUIRY_SOURCES)[number];
export const INQUIRY_SOURCE_LABELS: Record<string, string> = {
  mail: 'メール', slack: 'Slack', phone: '電話', talk: '口頭', manual: '手入力',
};

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
    description: 'AI が業界ニュースを日次収集。カテゴリ・注目度で管理',
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

/*
 * ⚠️ ここに `weekStartOf` / `addDays`（日付ナビ用）があったが、デイリーニュース報告を
 * 月表示に作り替えたレビューで「呼び手が0件」と判明したため削除した（v4.5.26）。
 * 週の月曜への丸めはサーバー側 `normalizeWeekStart`（`ops-report.service.ts`）が
 * 正で、画面側は `weekly_locked` を受け取るだけになった。
 */

export function toMonthStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** 'YYYY-MM' を月単位でずらす（負数で過去へ） */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return toMonthStr(new Date(y, (m - 1) + delta, 1));
}

/** その月の最後の日 ('YYYY-MM-DD') */
export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return toDateStr(new Date(y, m, 0)); // 翌月の0日目 = 当月末日
}

/** 'YYYY-MM' → 'YYYY年M月' */
export function formatMonthJa(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return `${y}年${m}月`;
}

/**
 * 1万円未満はそのままの円。**この振る舞いは残す** — 5,000 円を「¥1万」と出すと
 * 倍に見えるため。丸め方だけ shared に寄せた (`compactYen`)。
 * 以前は `Math.round(n / 10000)` で、**負の数だけ丸め方が違っていた**
 * (-15,000 円 → 「¥-1万」。他の画面は「¥-2万」)。
 */
export const formatYen = compactYen;
