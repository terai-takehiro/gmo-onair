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
  vendor_type?: string;
  invoice_registration_number?: string;
  notes?: string;
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
  vendor_type: string;
  invoice_registration_number: string;
  notes: string;
}

export const EMPTY_COMPANY_FORM: CompanyForm = {
  name: "", short_name: "", contact_name: "", email: "", phone: "",
  address: "", is_customer: false, is_vendor: false, is_sga_payee: false,
  is_gmo_group: false, vendor_type: "", invoice_registration_number: "", notes: "",
};
