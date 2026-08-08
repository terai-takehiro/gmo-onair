/**
 * 案件フォームの値と、日付まわりの小さな道具 (v4)
 *
 * 画面を持たない部分だけを置きます。**中のロジックは分割前と同じ**です
 * (枠の入れ替えと中身の作り直しを同じ回でやると、どちらが原因で壊れたのか
 *  切り分けられなくなるため)。
 */

export interface FormValues {
  name: string;
  customer_id: string;
  customer_type: string;
  project_type: string;
  project_type_other: string;
  /** 'A' = 案件 (GLS-A) / 'B' = プロジェクト (GLS-B・プロジェクト管理の持ち物) */
  gls_category: '' | 'A' | 'B';
  event_start: string;
  event_end: string;
  expected_amount: number;
  assigned_to: string;
  broadcast_type: string;
  media_platform: string;
  tags: string;
  notes: string;
  box_url_internal: string;
  box_url_external: string;
  application_form: boolean;
  logo_permission: boolean;
}

export const EMPTY_FORM: FormValues = {
  name: '', customer_id: '', customer_type: 'external', project_type: '', project_type_other: '',
  gls_category: '',
  event_start: '', event_end: '', expected_amount: 0, assigned_to: '',
  broadcast_type: '', media_platform: '', tags: '', notes: '',
  box_url_internal: '', box_url_external: '',
  application_form: false, logo_permission: false,
};

export interface GlsDialogState {
  open: boolean;
  mode: 'new' | 'link';
  broadcast_types: string[];
  media_platforms: string[];
  target_project_id: string;
}

/** 追加の日程 (飛び日) の1行 */
export interface ExtraDate {
  date: string;
  label: string;
}

/**
 * この案件に紐づくスタジオ予約 (`GET /studios/bookings?project_id=`)。
 *
 * **`StudioBookingDialog` がそのまま受け取れる形にしてある。** 一覧の表示に要る
 * 4つだけに絞ると、行を押して開くときに型が合わず `as any` を書くことになる
 * (分割前は予約まわりが全部 `any` だった)。
 */
export interface ProjectBooking {
  id: string;
  title: string;
  booking_type: string;
  project_id: string | null;
  episode_id: string | null;
  all_day: number;
  start_time: string;
  end_time: string;
  location_note: string | null;
  notes: string | null;
  status?: string;
  rooms: {
    room_id: string;
    room_name: string;
    room_color: string;
    room_type?: string;
    location_id: string;
    occupant?: string;
    usage_note?: string;
  }[];
}

/** 部屋を選ぶための拠点と部屋 (`GET /studios/locations`) */
export interface StudioLocation {
  id: string;
  name: string;
  rooms: { id: string; name: string; abbreviation?: string | null; color: string }[];
}

/** GLS 番号を持つ案件 (紐づけ先を選ぶための一覧) */
export interface GlsProject {
  id: string;
  gls_number: string;
  name: string;
  customer_name: string;
}

/**
 * inclusive な終了日 (YYYY-MM-DD) を 1 日進めて exclusive-end に変換する。
 * StudioBookingDialog / FullCalendar は終日イベントの end を exclusive (end-1 が最終日)
 * として扱うため、案件の event 日付 (inclusive) を presetDate に渡すときはこれで揃える。
 * toISOString() の UTC 変換によるズレを避けるためローカル日付演算で計算。
 */
export function addOneDayStr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(y, m - 1, d + 1);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`;
}
