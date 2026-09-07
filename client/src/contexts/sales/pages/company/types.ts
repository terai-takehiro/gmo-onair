/**
 * 取引先マスターの値の形（一覧・ダイアログで共用）
 *
 * `CompanyListPage.tsx` から切り出したもの。**写しを作らないこと** —
 * 列を1つ足すたびに、一覧とダイアログのどちらかが取り残されます。
 */

export interface Company {
  id: string;
  name: string;
  short_name?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  is_customer: boolean;
  is_vendor: boolean;
  is_sga_payee?: boolean;
  /**
   * GMOインターネットグループのグループ会社か（migration 192）。
   * **案件のグループ内 / グループ外はこの印から決まります**
   * （見積の単価が定価かグループ内価格かも、これで決まる）。
   */
  is_gmo_group?: boolean;
  /**
   * 「サムライ関連」のお客様か（migration 291）。隔週キープのヨミ表で
   * 「サムライ関連案件」の別表に出る（サムライパートナーズ／GMOサムライコンテンツスタジオ）。
   * **社名からは見立てない — 人がここで付ける**（サーバーも同じ。渡さなければ今の値を保つ）
   */
  samurai_group?: boolean;
  vendor_type?: string;
  invoice_registration_number?: string;
  notes?: string;
  customer_id?: string;
  vendor_id?: string;
  /** 与信限度額（円）。NULL/未設定=決めていない（migration 272・登録は任意） */
  credit_limit_amount?: number | null;
  /** 最新与信確認日。NULL=未確認（migration 272・登録は任意） */
  credit_check_date?: string | null;
}

export interface CompanyForm {
  name: string;
  short_name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  is_customer: boolean;
  is_vendor: boolean;
  is_sga_payee?: boolean;
  is_gmo_group: boolean;
  samurai_group: boolean;
  vendor_type: string;
  invoice_registration_number: string;
  notes: string;
  /**
   * 与信限度額・最新与信確認日は、他の任意テキスト欄と同じく**文字列で持つ**
   * （`DiscountLimits.tsx` と同じ方式）。`CurrencyInput` は空欄でも 0 を返すため
   * 使わず、送信時に「空文字→null」へ自前で変換する（`CompanyListPage.tsx`）。
   */
  credit_limit_amount: string;
  credit_check_date: string;
}

export const EMPTY_COMPANY_FORM: CompanyForm = {
  name: "", short_name: "", contact_name: "", email: "", phone: "",
  address: "", is_customer: false, is_vendor: false, is_sga_payee: false,
  is_gmo_group: false, samurai_group: false, vendor_type: "", invoice_registration_number: "", notes: "",
  credit_limit_amount: "", credit_check_date: "",
};
