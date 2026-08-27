/**
 * 案件台帳の列 — 「どの列があるか」の唯一の表
 *
 * ── なぜ既存の「案件一覧」と別の画面なのか ──────────────────
 *
 * `/sales/projects`（案件一覧）は**毎日開いて次の一手を決める画面**です。
 * 1行に「案件名・ステージ・見積金額・次のタスク」だけを置き、名前の列だけが
 * 伸びる形にしてあります（`projectList/`）。**そこに列を足していくと、
 * 毎日使う画面が読めなくなります。**
 *
 * この画面（案件台帳）は逆に**データを網羅して見る・まとめて直す**ためのもので、
 * 機材台帳（`client-equipment/src/pages/equipmentList/`）と同じ作りにしてあります:
 *
 *   ・列は**出し入れできる**（既定で出すのは 9 列。全部で 20 列）
 *   ・並びも変えられて、**利用者ごとに端末に残る**（`useColumnPrefs`）
 *   ・行を選んで**まとめて直せる**（`BulkEditDialog`）
 *
 * ── 列を足すときはここだけ直す ──────────────────────────────
 *
 * `COL_DEFS` に1行足せば、列の出し入れ・並べ替え・表頭・本文の全部に出ます。
 * **表頭と本文を別々に書かないこと** — 片方だけ足すと列がずれます
 * （機材台帳が `EquipmentTable` と `EquipmentCells` を分けているのと同じ理由で、
 * こちらは1つの表から両方を作ります）。
 *
 * `shared/tests/projectLedger.test.ts` が「既定の列が本当に既定か」
 * 「幅が寸法表の段に乗っているか」を固定しています。
 */
import type { ProjectStage } from '@/types';

/** 列の鍵。**`COL_DEFS` から導く**（2か所に書くと必ずずれる） */
export type LedgerColKey = (typeof COL_DEFS)[number]['key'];

/**
 * 列の幅の段。**`shared/src/client/ui/row.tsx` の `SLOT_WIDTHS` と同じ7段**に
 * 乗せます。ここで独自の幅を作ると「この画面だけの幅」ができ、
 * 金額の桁が他の一覧と揃わなくなります。
 */
export type LedgerColWidth = 56 | 72 | 96 | 128 | 160 | 200 | 240;

export interface LedgerColDef {
  key: string;
  /** 表頭に出す言葉。**用語は `docs/wording.md` に合わせる** */
  label: string;
  /** 既定で出すか。**出しすぎると横スクロールが長くなって読めない** */
  default: boolean;
  /** 固定幅。**全部の列が持ちます**（伸びる列を作らない・上の理由） */
  width: LedgerColWidth;
  /** 右寄せにするか（金額・件数） */
  numeric?: boolean;
  /**
   * 表頭を押したときにサーバーへ渡す並べ替えの鍵（`GET /projects` の `sort_by`）。
   *
   * ⚠️ **画面で並べ替えないこと。** 出ているのは 100 件だけなので、
   * 画面で並べ替えると**そのページの中だけが並び替わり**、
   * 「いちばん古いもの」を探しているのに 2 ページ目の行が出てきません
   * （整合性の件数を画面で数えてはいけないのと同じ理由）。
   *
   * **無い列は押せません**（サーバーが並べ替えられないものを押させない）。
   */
  sort?: string;
}

/**
 * 列の並び（既定）。**業務で目で追う順**にしてあります —
 * 番号 → 名前 → お客様 → 段 → 分類 → 日 → お金 → 人 → 状態。
 *
 * `default: true` は 9 列だけ。残りは `ColumnPicker` から出します
 * （最初から 20 列出すと、開いた瞬間に横スクロールが 3 画面ぶんになる）。
 */
export const COL_DEFS = [
  /**
   * ⚠️ **96px にしない**（実測）。表頭に並べ替えの印が入るぶんだけ文字の場所が
   * 減り、「GLS番号」「最後の動き」が **「GLS…」「最後の…」に切れて**いました。
   * 表頭が読めないと、その列が何なのか分かりません。
   */
  { key: 'gls_number', label: 'GLS番号', default: true, width: 128, sort: 'code' },
  { key: 'code', label: '社内コード', default: false, width: 128 },
  /**
   * ⚠️ **案件名にも幅を持たせています**（伸びる列を作っていません）。
   * 伸びる列があると `table-layout: fixed` が使えず、**ブラウザが中身に合わせて
   * 列を広げます** — 実測すると 1440px の画面で表が 1376px になり、
   * **いちばん右の列（最後の動き）が黙って画面の外**に出ていました。
   * 幅が決まっていれば、どの端末でも同じ位置で切れます。
   */
  { key: 'name', label: '案件名', default: true, width: 240, sort: 'name' },
  { key: 'customer_name', label: 'お客様', default: true, width: 160, sort: 'customer' },
  { key: 'contact_name', label: 'ご担当', default: false, width: 128 },
  { key: 'stage', label: 'ステージ', default: true, width: 96, sort: 'stage' },
  { key: 'gls_category', label: 'GLS分類', default: false, width: 72 },
  { key: 'classification', label: '案件分類', default: true, width: 128 },
  { key: 'recurrence', label: '継続区分', default: false, width: 96 },
  { key: 'event_start', label: '実施日', default: true, width: 128, sort: 'event_start' },
  { key: 'event_end', label: '実施日（終了）', default: false, width: 128 },
  { key: 'attendee_count', label: '来場人数', default: false, width: 96, numeric: true },
  { key: 'estimate_amount', label: '見積金額', default: true, width: 128, numeric: true, sort: 'estimate_amount' },
  { key: 'expected_amount', label: '想定金額', default: false, width: 128, numeric: true, sort: 'expected_amount' },
  { key: 'total_revenue', label: '確定売上', default: false, width: 128, numeric: true },
  { key: 'total_purchase', label: '仕入', default: false, width: 128, numeric: true },
  { key: 'assigned_to_name', label: '社内の担当', default: true, width: 128, sort: 'assigned_to' },
  { key: 'intake_channel', label: 'リード経路', default: false, width: 128 },
  { key: 'application_form', label: '申込書', default: false, width: 72 },
  { key: 'next_task_due', label: '次の期限', default: false, width: 128, sort: 'next_task_due' },
  { key: 'last_activity_at', label: '最後の動き', default: true, width: 128, sort: 'last_move' },
] as const satisfies readonly LedgerColDef[];

export const DEFAULT_COL_ORDER: LedgerColKey[] = COL_DEFS.map((c) => c.key);
export const DEFAULT_VISIBLE_COLS: LedgerColKey[] =
  COL_DEFS.filter((c) => c.default).map((c) => c.key);

export function colDef(key: LedgerColKey): LedgerColDef {
  return COL_DEFS.find((c) => c.key === key) as LedgerColDef;
}

/**
 * 台帳の1行。`GET /projects` が返すもののうち、この画面が使う分だけ。
 *
 * **`Record<string, unknown>` で受けないこと**（`projectList/types.ts` と同じ理由）—
 * サーバーが列名を変えても型で気づけず、画面が黙って空欄になります。
 */
export interface LedgerRow {
  id: string;
  code: string | null;
  gls_number: string | null;
  gls_category: 'A' | 'B' | null;
  name: string;
  customer_name: string | null;
  customer_id: string | null;
  contact_name: string | null;
  stage: ProjectStage;
  audience: string | null;
  project_category: string | null;
  project_type: string | null;
  recurrence: string | null;
  event_start: string | null;
  event_end: string | null;
  attendee_count: number | null;
  estimate_amount: number | string | null;
  expected_amount: number | string | null;
  total_revenue: number | string | null;
  total_purchase: number | string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  intake_channel: string | null;
  application_form: number | boolean | null;
  next_task_due: string | null;
  last_activity_at: string | null;
}

export interface LedgerResponse {
  data: LedgerRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/**
 * まとめて直せる項目。**サーバー（`PATCH /projects/bulk`）が受ける物だけ**を並べます。
 *
 * ⚠️ **ステージは入れていません**（ご判断）。段を動かすと
 * 履歴（`project_stage_changes`）が1行増え、失注なら理由が要り、受注なら
 * GLS 発番の確認が挟まります。`PATCH /projects/bulk` はそのどれもしないので、
 * ここから変えられるようにすると**記録の残らない段の移動**が起きます。
 * 段は案件詳細のヘッダーから1件ずつ動かします。
 *
 * ⚠️ **案件分類は2つで1つ**（`classification`）。片方だけ送ると
 * サーバーが導けず**黙って捨てられる**ので、ダイアログで2つとも選ばせます。
 */
export const BULK_FIELDS = [
  { key: 'classification', label: '案件分類（客入れの有無 × 分類）' },
  { key: 'assigned_to', label: '社内の担当' },
  { key: 'customer_id', label: 'お客様' },
  { key: 'event_start', label: '実施日（開始）' },
  { key: 'event_end', label: '実施日（終了）' },
  { key: 'application_form', label: '申込書' },
] as const;

export type BulkFieldKey = (typeof BULK_FIELDS)[number]['key'];
