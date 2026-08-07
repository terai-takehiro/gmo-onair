/** ④ カレンダーの設定 — 3つのタブが共通で使う型 */

/**
 * 部屋。**`StudioRoomsManagerDialog` の型と噛み合う形**にしておく
 * （そのまま渡すので、緩くすると渡せない）
 */
export interface RoomRow {
  id: string;
  name: string;
  abbreviation?: string | null;
  color: string;
  room_type: string;
  sort_order: number;
  location_id: string;
}

export interface LocationRow {
  id: string;
  name: string;
  sort_order: number;
  rooms: RoomRow[];
}

/** `GET /studios/rooms/feeds` の返り。**トークン付きの URL がそのまま入る** */
export interface FeedsPayload {
  calendar_feed_url: string;
  rooms: {
    room_id: string;
    room_name: string;
    location_name: string | null;
    room_type: string | null;
    signage_url: string;
  }[];
}

export interface IcsFeedRow {
  id: string;
  label: string;
  last_synced_at: string | null;
  last_error: string | null;
  event_count: number | null;
}

export interface OAuthStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  event_count: number | null;
  can_write?: boolean;
}
