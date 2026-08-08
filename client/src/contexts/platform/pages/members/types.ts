/** v4 設定 ③ 権限とメンバー で使う形 */

export interface Role {
  id: string;
  name: string;
  description: string | null;
  is_builtin: boolean;
  sort_order: number;
  /** 区画 → 段。ここに無い区画は「なし」 */
  modules: Record<string, string>;
  member_count: number;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  /** システム上の区別 (`system_admin` / `staff`)。**役割とは別物** */
  role: string;
  status?: string;
  phone?: string;
  /** 押してある役割。null = まだ押していない */
  permission_role_id?: string | null;
  last_login_at?: string | null;
  created_at?: string;
}

export interface RolesResponse {
  roles: Role[];
  /** 役割が面倒を見る区画（サーバーが正） */
  modules: string[];
  /** 役割が絶対に触らない区画（凍結4アプリ） */
  untouched: string[];
}
