import type { ProjectStage } from '@/types';

/** `GET /projects/:id` のうち、案件詳細が使う分だけ */
export interface ProjectDetail {
  id: string;
  code: string | null;
  gls_number: string | null;
  gls_category: 'A' | 'B' | null;
  name: string;
  stage: ProjectStage;
  project_type: string | null;
  /**
   * 案件分類の2段（migration 182）。**旧 `project_type` と併存**しており、
   * 書くのはサーバーだけです（`server/.../project-classification.ts`）。
   * GLS-B の案件と、2段が入る前に作られた案件は null。
   */
  audience?: string | null;
  project_category?: string | null;
  customer_name: string | null;
  event_start: string | null;
  event_end: string | null;
  expected_amount: number | string | null;
  total_revenue: number | string | null;
  /** 見積金額（束ごとの最新版の合計・税抜）。一覧と同じ計算をサーバーが出す */
  estimate_amount?: number | string | null;
  tags: string | null;
  box_url_internal: string | null;
  box_url_external: string | null;
  updated_at: string;
  /**
   * AI がメールから起票した案件か。**サーバーが計算して返す**
   * (`projects.routes.ts` の詳細取得が書き込みの記録と突き合わせる)。
   * 本人名義で実行された分も検出されるので、画面側で作られ方を推測しない。
   */
  is_ai_created?: boolean;
  /** 「確認した」を押した時刻。押されるまで null */
  ai_reviewed_at?: string | null;
  /** 登録の16項目のうち、migration 170 で足したぶん */
  contact_name?: string | null;
  recurrence?: 'single' | 'regular' | null;
  attendee_count?: number | null;
  goal?: string | null;
  reply_due?: string | null;
  wants?: string | null;
  /** 引き合いの入口 (migration 165) */
  intake_channel?: string | null;
  /**
   * 標準工程を入れた時刻 (migration 178)。**入っていれば二度は入れられない**
   * （押し直しで同じタスクが2組できると、どちらを消すか分からなくなる）
   */
  flow_applied_at?: string | null;
  /**
   * 飛び日を含む実施日（`project_dates`）。**スマホのタブを段階で切り替える**ときに
   * 「いずれかの日が今日か」を見るために使う（`tabs.ts` の `projectPhase`）
   */
  dates?: { date: string }[];
}

/**
 * `GET /studios/bookings?project_id=` の1行。
 *
 * ⚠️ **ここは実際に返ってくる形に合わせてあります。** 元は `booking_date` /
 * `room_name` / `location_name` を宣言していましたが、**サーバーはその3つを
 * 1つも返しません**（`studio-booking.service.ts` の `listBookings`）。
 * 日付は `start_time` / `end_time`、部屋は `rooms[]`、外現場は `location_note` です。
 * 型が嘘をついていたので、**押さえている部屋が必ず「部屋 未設定」と出ていました** —
 * 型チェックにも lint にも出ない壊れ方です。**存在しない項目を足さないこと。**
 */
export interface StudioBooking {
  id: string;
  title: string;
  booking_type: string;
  /** `YYYY-MM-DDTHH:mm`（TEXT 列）。**日付だけの列は無い** */
  start_time: string;
  end_time: string;
  all_day?: number;
  status?: string;
  /** 外現場など、部屋マスターに無い場所の手入力 */
  location_note: string | null;
  /**
   * 押さえている部屋。**予約に部屋が1つも無いこともある**（外現場・場所未定）。
   * `location_abbreviation` は拠点の略称（migration 189・**決めていなければ null**）
   */
  rooms?: {
    room_id: string;
    room_name: string | null;
    location_abbreviation?: string | null;
  }[];
}

/** `GET /activity-logs?project_id=` の1行 */
export interface ActivityLog {
  id: string;
  activity_date: string;
  subject: string;
  next_action: string | null;
  next_action_date: string | null;
  next_action_done_at: string | null;
  /** 種類。`memo` は社内の書き置き（migration 184 でメモをここに畳んだ） */
  activity_type?: string;
  /** **原文**。AI が整形しても、打った文はここに残る */
  description?: string | null;
  /**
   * AI が整えた本文。**サーバーが保存前にサニタイズ済み**
   * （許可タグ9つ・属性なし。`server/src/shared/services/html-sanitize.ts`）。
   * 画面側で削り直さない — 守りは入口に1か所だけ置く
   */
  body_html?: string | null;
  /** 要点。**v1 の欄**（構造がある行では `facts` が同じ役割を担うので出さない） */
  key_points?: string[] | null;
  /**
   * 整えた本文の**構造**（migration 188）。状態・事実・発言に分かれている。
   * 読み取りと型は `thread/struct.ts`。**これがある行は会話の形で描く**
   */
  body_struct?: unknown;
  /** AI が整形したか（紫のバッジ） */
  ai_formatted?: boolean;
  user_name?: string | null;
}
