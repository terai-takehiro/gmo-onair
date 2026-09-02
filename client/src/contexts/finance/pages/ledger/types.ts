/**
 * 財務の台帳（③ 売上 ／ ④ 仕入 ／ ⑤ 販管費）で共有する型 (v4)
 *
 * 3つの台帳は列の意味がほぼ同じ（コード／名前・説明／相手先／金額／計上月／状態）なので、
 * **行の描き方を1つにまとめる**ために共通の形に寄せています。
 * 中身の取り方だけが違うので、各ページで `LedgerRow` に詰め替えます。
 */

/** 台帳1行の「描くための形」。どのテーブルから来たかを画面は知らない */
export interface LedgerRow {
  id: string;
  /** 左端の小さいコード。売上=GLS番号/話数コード、仕入=GLS番号、販管費=勘定科目 */
  code: string | null;
  /** 主役の見出し（伸びる列）。売上=案件名、仕入=案件名/説明、販管費=詳細 */
  title: string;
  /** 見出しの下の補足 */
  sub: string | null;
  /** 相手先。売上=請求先、仕入=仕入先、販管費=支払先 */
  party: string | null;
  amount: number;
  tax_category: string;
  /** YYYY-MM-DD */
  recognition_date: string | null;
  /** 右端の状態。無い台帳は null */
  state: LedgerState | null;
  /** 押したときに開く案件（無ければ押せない） */
  project_id: string | null;
  /**
   * 申請URL（精算申請ページ等）。仕入・販管費だけが持つ（売上は無いので未指定のまま）。
   * **`state.to` とは別の行き先。** `state.to` は自社サイト内の画面遷移（`navigate()`）
   * だが、こちらは外部サイトなので新しいタブで開く（仕様変更 #4・#6・#7）
   */
  settlement_url?: string | null;
  /**
   * `state` とは別のもう1つのバッジ（例: 売上の「検収済」）。**押しても遷移しない
   * 表示だけの印**（`to` を持たない）。無ければ出さない — `state` と違い、
   * 済んでいない側は表示せず「有るときだけ出す」流儀（仕入・販管費の「仮」タグと同じ）
   */
  secondaryBadge?: Pick<LedgerState, 'label' | 'tone' | 'title'> | null;
}

/** 右端の状態バッジ。**色は意味で決める**（画面ごとに変えない） */
export interface LedgerState {
  label: string;
  tone: 'neutral' | 'ok' | 'warn' | 'danger' | 'info';
  /** 押したときの行き先。無ければただの表示 */
  to?: string;
  title?: string;
}

export const STATE_TONE: Record<LedgerState['tone'], string> = {
  neutral: 'border-transparent bg-muted text-muted-foreground',
  ok: 'border-transparent bg-success-surface text-success',
  warn: 'border-transparent bg-warning-surface text-warning',
  danger: 'border-transparent bg-destructive-surface text-destructive',
  info: 'border-transparent bg-info-surface text-info',
};

// ── 売上（③）─────────────────────────────────────────────────

export interface RevenueItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  pricing_item_id?: string;
  period_start?: string | null;
  period_end?: string | null;
  item_notes?: string | null;
  category?: string | null;
}

export interface RevenueRow {
  id: string;
  billing_key: string | null;
  project_id: string;
  project_name: string | null;
  gls_number: string | null;
  customer_name: string | null;
  event_end: string | null;
  amount: number;
  tax_category: string;
  recognition_date: string | null;
  billing_date: string | null;
  payment_due_date: string | null;
  notes: string | null;
  is_advance_payment: boolean;
  invoice_issued?: boolean;
  /** migration 140。**フラグではなく日付**（入っていれば済み） */
  inspection_date?: string | null;
  paid_date?: string | null;
  group_id: string | null;
  status: string;
  items?: RevenueItem[];
  /** 月次ユニット等エピソード紐づき時のコード (例 GLS-B005-2607)。表示は GLS 番号より優先 */
  episode_code?: string | null;
}

export interface ProjectOption {
  id: string;
  gls_number: string;
  name: string;
  customer_id: string;
  customer_name?: string;
  project_type?: string;
  customer_type?: string;
  expected_amount?: number;
  event_end?: string;
}

export interface EpisodeOption {
  id: string;
  episode_code: string;
  episode_number: number;
}

// ── 仕入（④）─────────────────────────────────────────────────

export interface PurchaseRow {
  id: string;
  billing_key: string | null;
  project_id: string | null;
  project_name: string | null;
  gls_number: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  description: string | null;
  amount: number;
  tax_category: string;
  recognition_date: string | null;
  payment_due_date: string | null;
  /**
   * 役務提供完了日。**`purchases` だけ `DATE` 型**（他の日付列は TEXT）なので、
   * API からは `2026-08-31T00:00:00.000Z` の形で返る。表示・編集に使うときは
   * `ledger/serviceDate.ts` の `toServiceDateInput()` を通すこと。
   */
  service_completed_date: string | null;
  notes: string | null;
  group_id: string | null;
  group_name: string | null;
  settlement_method: string | null;
  settlement_number: string | null;
  settlement_url: string | null;
  /** 確定前の見込み。**「仮」バッジになる** */
  is_provisional: boolean;
  invoice_qualified: number | boolean | null;
  /** 月次ユニット等エピソード紐づき時のコード。表示は GLS 番号より優先 */
  episode_code?: string | null;
}

// ── 販管費（⑤）───────────────────────────────────────────────

export interface SgaRow {
  id: string;
  billing_key: string | null;
  expense_type: string | null;
  vendor_name: string | null;
  description: string | null;
  amount: number;
  tax_category: string;
  recognition_date: string | null;
  payment_due_date: string | null;
  settlement_method: string | null;
  settlement_number: string | null;
  settlement_url?: string | null;
  notes: string | null;
  /** `staff`=社員が入れた / `accounting`=経理の取込 */
  source: string | null;
  /** 確定前の見込み (migration 268)。**「仮」バッジになる**（仕入の `is_provisional` と同じ扱い） */
  is_provisional: boolean;
}
