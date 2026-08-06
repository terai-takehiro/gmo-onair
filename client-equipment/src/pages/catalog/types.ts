/**
 * ケーブル・コネクタの共通の型と設定 (v4 ②機材台帳「ケーブル・コネクタ」タブ)
 *
 * ── なぜ1つにまとめたか ────────────────────────────────────
 *
 * `CablePage.tsx` (839行) と `ConnectorPage.tsx` (792行) は**ほぼ複製**でした。
 * 実際に差分を取ると、違うのは
 *
 *   ・ケーブルにだけ **長さ (m)** と **色** の列がある
 *   ・数える単位が **本 / 個**
 *   ・API の宛先 (`/equipment/cables` / `/equipment/connectors`) と表示名
 *
 * の3点だけで、残り 700 行あまりは同じコードです。片方だけ直された跡も
 * ありました (コピーの操作にだけ `title` が付いている、など)。
 *
 * **列の意味と保存する値は変えていません。** 種別 (映像/音声/NW/照明/電源/その他)・
 * 設置場所・商品名・メーカー・型名・m・色・本数/個数・収納方法・備考は
 * 今までと同じ列を同じ名前で読み書きします。
 */

/** 用途の種別。**保存する値 (`kind`) は今までと同じ** */
export const CATALOG_KINDS = [
  { code: 'video', label: '映像' },
  { code: 'audio', label: '音声' },
  { code: 'network', label: 'NW' },
  { code: 'lighting', label: '照明' },
  { code: 'power', label: '電源' },
  { code: 'other', label: 'その他' },
] as const;

export type KindCode = (typeof CATALOG_KINDS)[number]['code'];

export const KIND_LABELS: Record<string, string> = Object.fromEntries(
  CATALOG_KINDS.map((k) => [k.code, k.label]),
);

/**
 * 用途の色。**状態の色 (success / warning / destructive) を使わない** —
 * 「映像」は良い状態でも悪い状態でもなく、ただの見分けだからです
 * (docs/design/v4/_tokens.md「意味を持たない見分けの色 = cat-1〜cat-8」)。
 */
export const KIND_TONE: Record<string, string> = {
  video: 'bg-cat-1/15 text-cat-1 border-transparent',
  audio: 'bg-cat-2/15 text-cat-2 border-transparent',
  network: 'bg-cat-3/15 text-cat-3 border-transparent',
  lighting: 'bg-cat-4/15 text-cat-4 border-transparent',
  power: 'bg-cat-5/15 text-cat-5 border-transparent',
  other: 'bg-muted text-muted-foreground border-transparent',
};

/** 台帳に並ぶ1品目。ケーブルとコネクタで**同じ形**にしてある */
export interface CatalogItem {
  id: string;
  kind: KindCode;
  location_id: string | null;
  location_name?: string | null;
  name: string;
  manufacturer_id: string | null;
  manufacturer_name?: string | null;
  model_number: string | null;
  /** ケーブルだけが持つ。コネクタは常に `undefined` */
  length_m?: number | string | null;
  /** ケーブルだけが持つ */
  color?: string | null;
  quantity: number;
  storage_method: string | null;
  notes: string | null;
  sort_order: number;
}

export interface CatalogForm {
  kind: KindCode;
  location_id: string;
  name: string;
  manufacturer_id: string;
  model_number: string;
  length_m: string;
  color: string;
  quantity: string;
  storage_method: string;
  notes: string;
}

export const EMPTY_FORM: CatalogForm = {
  kind: 'video', location_id: '', name: '',
  manufacturer_id: '', model_number: '', length_m: '',
  color: '', quantity: '0', storage_method: '', notes: '',
};

/** ケーブルとコネクタの違いはここだけ */
export interface CatalogConfig {
  key: 'cable' | 'connector';
  /** 画面に出す名前 */
  label: string;
  /** API の宛先 */
  endpoint: string;
  /** React Query の鍵 */
  queryKey: string;
  /** 数える単位 (本 / 個) */
  unit: string;
  /** 長さ (m) と色を持つか。コネクタは持たない */
  hasLength: boolean;
  /** 登録ダイアログの入力例 */
  namePlaceholder: string;
  modelPlaceholder: string;
  storagePlaceholder: string;
  /** Excel の書き出し・雛形のファイル名 */
  exportFileName: string;
  templateFileName: string;
}

export const CABLE_CONFIG: CatalogConfig = {
  key: 'cable',
  label: 'ケーブル',
  endpoint: '/equipment/cables',
  queryKey: 'equipment-cables',
  unit: '本',
  hasLength: true,
  namePlaceholder: 'HDMIケーブル 3m',
  modelPlaceholder: 'HDM03',
  storagePlaceholder: 'ケーブルバスケット A-1',
  exportFileName: 'ケーブル',
  templateFileName: 'ケーブル_テンプレート.xlsx',
};

export const CONNECTOR_CONFIG: CatalogConfig = {
  key: 'connector',
  label: 'コネクタ',
  endpoint: '/equipment/connectors',
  queryKey: 'equipment-connectors',
  unit: '個',
  hasLength: false,
  namePlaceholder: 'BNCコネクタ オス',
  modelPlaceholder: 'BCP-B25HD',
  storagePlaceholder: 'パーツケース B-3',
  exportFileName: 'コネクタ',
  templateFileName: 'コネクタ_テンプレート.xlsx',
};

export const CATALOG_CONFIGS: CatalogConfig[] = [CABLE_CONFIG, CONNECTOR_CONFIG];

/** 品目を並べ替えて数える (合計本数)。0 は値として扱う */
export function totalQuantity(items: CatalogItem[]): number {
  return items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
}
