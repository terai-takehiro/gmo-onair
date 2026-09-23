/**
 * 技術資料（制作技術支援のミニアプリ）— サーバーと画面で共有する形。
 * 設計: docs/design/v4/tech-docs.md §5。列名は migration 305 の snake_case をそのまま使う
 * （サーバーは `pg` の行をそのまま返し、画面側で読み替えない）。
 * サーバーは `server/src` の外を import できないため、`server/src/shared/tech/types.ts` に複製がある
 * （`scripts/check-collab-parity.mjs` の PAIRS で一致を検査）。
 */

export type TechDocStatus = 'draft' | 'fixed';

export interface TechDoc {
  id: string;
  doc_no: string | null;
  title: string;
  project_id: string | null;
  program_id: string | null;
  status: TechDocStatus;
  rev: number;
  copied_from: string | null;
  fixed_at: string | null;
  fixed_by: string | null;
  locked_by: string | null;
  locked_at: string | null;
  lock_requested_by: string | null;
  lock_requested_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** 一覧の1件（件数を添える） */
export interface TechDocListItem extends TechDoc {
  patch_row_count: number;
  staff_row_count: number;
  staff_day_count: number;
  extra_device_count: number;
  updated_by_name: string | null;
}

export interface TechPatchRow {
  id: string;
  tech_doc_id: string;
  group_label: string;
  sort_order: number;
  from_device_text: string;
  from_jack_id: string | null;
  from_jack_text: string;
  from_is_extra: boolean;
  to_device_text: string;
  to_jack_id: string | null;
  to_jack_text: string;
  to_is_extra: boolean;
  label: string;
  signal: string;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface TechStaffRow {
  id: string;
  tech_doc_id: string;
  work_date: string; // YYYY-MM-DD
  role: string;
  person_id: string | null;
  person_name: string;
  /** 取引先（`companies.id`。§13-5）。台帳から引いたときだけ入る */
  company_id: string | null;
  company_name: string;
  note: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** GET /techops/tech-docs/:id */
export interface TechDocDetail {
  doc: TechDoc;
  patch_rows: TechPatchRow[];
  staff_rows: TechStaffRow[];
  locked_by_name: string | null;
  lock_requested_by_name: string | null;
}

/**
 * 行（映像パッチ・技術スタッフ）の作成・更新・削除・並べ替えの応答（`{ success, data, doc_updated_at }`）。
 * 行を触るとサーバーが親の資料の `updated_at` を進めるので、画面はこの値で `detail.doc.updated_at` を
 * 合わせる（合わせないと次の名前の保存が古い `expected_updated_at` を送って 409 になる）。削除の `data` は `{ id }`。
 */
export interface TechRowMutationResponse<T> {
  success: boolean;
  data: T;
  doc_updated_at: string;
}

export type PatchPanelKind = 'jack' | 'trunk';
export type PatchJackRow = 'A' | 'B';

export interface PatchPanel {
  id: string;
  name: string; // VJP100
  jack_count: 32 | 48;
  kind: PatchPanelKind;
  location: string;
  model: string;
  note: string;
  sort_order: number;
  updated_at: string;
}

/** 一覧の1件（転記の進捗を添える） */
export interface PatchPanelListItem extends PatchPanel {
  /** A段か B段のどちらかに機材名が入っている番号の数 */
  filled_count: number;
  /** この盤を参照している映像パッチ行の数（使用中の目安） */
  used_count: number;
}

export interface PatchJack {
  id: string;
  panel_id: string;
  jack_no: number;
  jack_row: PatchJackRow;
  device_name: string;
  label: string;
  signal: string;
  area: string;
  note: string;
  updated_at: string;
}

/** GET /techops/tech-panels/:id */
export interface PatchPanelDetail {
  panel: PatchPanel;
  jacks: PatchJack[];
}

/** 機材の候補（盤に転記済みの機材名を DISTINCT で集めたもの） */
export interface PatchDeviceOption {
  device_name: string;
  area: string;
  /** その機材のパッチ番号（送り＝A段・受け＝B段の別は jack_row で分かる） */
  jacks: Array<Pick<PatchJack, 'id' | 'panel_id' | 'jack_no' | 'jack_row' | 'label' | 'signal'> & { panel_name: string }>;
}

/**
 * 技術人員の会社。**案件管理の取引先（`companies`）そのもの**（§13-5 の決定・migration 307）。
 * techops からは読むのに要る列だけを出す（取引先の編集は案件管理で行う）。
 */
export interface TechCompany {
  /** `companies.id` */
  id: string;
  name: string;
  /** 取引先の短い名前（未設定は空文字） */
  short_name: string;
  /** この会社の技術人員の数（削除した人を除く） */
  person_count: number;
}

export interface TechPerson {
  id: string;
  /** 所属する会社（`companies.id`。§13-5） */
  company_id: string | null;
  name: string;
  kana: string;
  main_roles: string[];
  active: boolean;
  partner_id: string | null;
  note: string;
  /** 参加回数（qsheet_tech_staff_rows を person_id で数えた値） */
  participation_count: number;
  /** 最近の作業日（YYYY-MM-DD）。無ければ null */
  last_work_date: string | null;
  company_name: string;
  company_short_name: string;
}
