/**
 * 案件フォームの値と、日付まわりの小さな道具 (v4)
 *
 * 画面を持たない部分だけを置きます。
 *
 * ── 項目は案件作成（`projectNew/fields.ts`）が正 ──────────────
 *
 * 入力欄は `projectNew/RequiredFields` / `projectNew/MoreFields` を
 * **そのまま呼びます**。ここに残っているのは、そのどちらにも出さないもの
 * （BOX の URL・申込書・番組情報・日程）と、react-hook-form が持つ形だけです。
 * **新しい項目をここにだけ足さないこと** — 作る画面に無い欄がまた増えます。
 */
import type { Audience, ProjectCategory } from '../../classification';

export interface FormValues {
  name: string;
  customer_id: string;
  customer_type: 'internal' | 'external';
  /**
   * 旧1段の案件種類。**この画面はもう欄を持ちません**（読むだけ）。
   * 分類は下の2段が正で、`project_type` はサーバーが2段から導きます
   * （`project-classification.ts`）。**保存では送りません** —
   * 送ると2段と種類がずれた行ができます。
   */
  project_type: string;
  /**
   * 客入れの有無 × 案件分類（migration 182）。**案件作成と同じ2段**です。
   * ここが空のまま保存すると分類の無い案件になるので、必須にしてあります
   * （GLS-B だけは訊きません。`missingOf`）。
   */
  audience: Audience | '';
  project_category: ProjectCategory | '';
  /** 'A' = 案件 (GLS-A) / 'B' = プロジェクト (GLS-B・プロジェクト管理の持ち物) */
  gls_category: '' | 'A' | 'B';
  /** 登録の項目（migration 165 / 170）。**案件作成と同じものを直せます** */
  contact_name: string;
  recurrence: 'single' | 'regular';
  /**
   * レギュラー案件（シリーズ）が案件全体で1つだけ持つ取り決め
   * （migration 262・regular-series.md §3）。**案件作成と同じもの**
   * （`projectNew/RegularSeriesFields`）をそのまま呼ぶ。
   *
   * ⚠️ **「1日あたりの本数」「回の単価」はここに無い**（仕様変更 #16・migration 269 で
   * 回（episodes）ごとの値にしたため、この画面の固定入力欄も廃止した）。
   */
  recording_cadence: string;
  fixed_studio_note: string;
  billing_cycle: string;
  /** 放送日オフセット（migration 264・積み残し1）。案件作成と同じもの */
  broadcast_offset_days: string;
  /** 来場人数。**文字列で持つ** — 空欄と 0 名を見分けるため（数値だと両方 0） */
  attendee_count: string;
  goal: string;
  intake_channel: string;
  event_start: string;
  event_end: string;
  expected_amount: number;
  assigned_to: string;
  broadcast_type: string;
  media_platform: string;
  box_url_internal: string;
  box_url_external: string;
  application_form: boolean;
}

export const EMPTY_FORM: FormValues = {
  name: '', customer_id: '', customer_type: 'external', project_type: '',
  audience: '', project_category: '',
  gls_category: '',
  contact_name: '', recurrence: 'single',
  recording_cadence: '', fixed_studio_note: '',
  billing_cycle: 'monthly_close', broadcast_offset_days: '',
  attendee_count: '', goal: '', intake_channel: '',
  event_start: '', event_end: '', expected_amount: 0, assigned_to: '',
  broadcast_type: '', media_platform: '',
  box_url_internal: '', box_url_external: '',
  application_form: false,
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
