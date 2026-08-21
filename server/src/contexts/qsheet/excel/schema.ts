/**
 * 台本 Excel（.xlsx）の列定義・機械キー・対応表。実装設計: 03-excel.md §4〜§7。
 *
 * ⚠️ 08（機器設定の Excel・`recording-excel.service.ts` 系）とは完全に別物（03-excel.md §0-0）。
 * このファイルを 08 から import しない・08 のものをここに import しない。
 *
 * ここは「列定義の唯一の正」。書き出し（workbook.ts）・取込（parse.ts / plan.ts）・
 * CSV（csv.ts）が全部ここを見る。値を変えるならここだけ変える。
 */

export const SCHEMA_VERSION = 1;

// ─── シートの論理名 ↔ 既定の日本語シート名（03-excel.md §3） ───
export const SHEET_NAMES = {
  info: '台本情報',
  script: '進行台本',
  mic: 'マイク香盤',
  micch: 'マイクCh',
  led: 'LEDシーン',
  stage: '立ち位置図ひな形',
  stagepos: '立ち位置図の要素',
  masters: 'マスター',
  example: '記入例',
  schema: '_schema',
} as const;
export type SheetLogicalName = keyof typeof SHEET_NAMES;

/** 各シートの A2 セルに埋める目印（シート名を変えられても追う。§5-3）。 */
export function sheetMark(logical: SheetLogicalName): string {
  return `#sheet:${logical}`;
}

// ─── 種別（進行台本シートの `種別` 列） ───
export const ROW_KIND = { SECTION: 'ロール', ROW: '行', BREAK: 'CM', VTR: 'VTR', PAGE_BREAK: '改ページ' } as const;
export type RowKind = (typeof ROW_KIND)[keyof typeof ROW_KIND];

// ─── 稿種別（§7-1）。生値との対応。`第3稿` のような計算結果は書き出さない。 ───
export const DRAFT_TYPE_JA_TO_RAW: Record<string, string> = { 連番: 'numbered', 準備稿: '準備稿', 決定稿: '決定稿' };
export const DRAFT_TYPE_RAW_TO_JA: Record<string, string> = { numbered: '連番', 準備稿: '準備稿', 決定稿: '決定稿' };

// ─── 状態（§7-1）。DB の CHECK 制約（QSHEET_STATUS）と対応。 ───
export const STATUS_JA_TO_RAW: Record<string, string> = { 下書き: 'draft', リハ: 'rehearsal', 本番: 'on_air', 保管: 'archived' };
export const STATUS_RAW_TO_JA: Record<string, string> = { draft: '下書き', rehearsal: 'リハ', on_air: '本番', archived: '保管' };

// ─── 色（§5-8）。`HighlightPicker.tsx` の HIGHLIGHT_COLORS と同じ値を複製。
//     サーバーはクライアントを import できない（impl/README.md §4-1）ため複製で揃える。 ───
export const HIGHLIGHT_COLOR_JA_TO_HEX: Record<string, string> = {
  黄: '#fef3c7', 緑: '#dcfce7', 青: '#dbeafe', 桃: '#fce7f3', 紫: '#ede9fe', 橙: '#ffedd5',
};
export const HIGHLIGHT_COLOR_HEX_TO_JA: Record<string, string> = Object.fromEntries(
  Object.entries(HIGHLIGHT_COLOR_JA_TO_HEX).map(([ja, hex]) => [hex, ja]),
);

// ─── マイク状態（§7-2） ───
export const MIC_STATE_JA_TO_RAW: Record<string, 'on' | 'standby' | 'off'> = { ON: 'on', STBY: 'standby', OFF: 'off' };
export const MIC_STATE_RAW_TO_JA: Record<string, string> = { on: 'ON', standby: 'STBY', off: 'OFF' };

// ─── LED/XR の Cue・トランジション（`ledXr.tsx` の LED_CUE_OPTIONS / LED_TRANSITION_OPTIONS を複製） ───
export const LED_CUE_OPTIONS = ['V明け', 'Qワード', '卓D'] as const;
export const LED_TRANSITION_OPTIONS = ['F.I.', 'C.I.'] as const;

// ─── 立ち位置図の要素種別（`StageEditor.tsx` の "person"|"rect" ↔ 日本語） ───
export const STAGE_ELEMENT_JA_TO_RAW: Record<string, 'person' | 'rect'> = { 人: 'person', 四角: 'rect' };
export const STAGE_ELEMENT_RAW_TO_JA: Record<string, string> = { person: '人', rect: '四角' };

// ─── 進行台本シートの固定列（§6）。`色` は scenario ブロックがある台本にだけ足す
//     （実装は row/section に `color` を持たず、scenario entries[0].highlight が行全体の
//     背景色として使われている — CueRow.tsx:120-123。03-excel.md §5-8/§6 は
//     `row.color` を前提にしていたが、これは設計書との食い違い。ここでは実装に合わせる）。
export interface FixedColumn { key: string; label: string; width: number; locked: boolean }
export const FIXED_COLUMNS: FixedColumn[] = [
  { key: 'kind', label: '種別', width: 8, locked: false },
  { key: 'id', label: 'ID', width: 16, locked: true },
  { key: 'parentId', label: '所属ロールID', width: 16, locked: true },
  { key: 'no', label: '通し#', width: 6, locked: true },
  { key: 'name', label: 'ロール名', width: 24, locked: false },
  { key: 'dur', label: '尺', width: 8, locked: false },
  { key: 'rowLabel', label: '行ラベル', width: 16, locked: false },
];
export const COLOR_COLUMN: FixedColumn = { key: 'color', label: '色', width: 8, locked: false };

// ─── ブロック型ごとの機械キー・フィールド定義（§4-3）。
//     `blk.<type>#<n>.<field>` の <field> 一覧と、日本語見出しの接尾辞。 ───
export interface BlockFieldDef { field: string; suffix: string; locked: boolean; width: number }
export const BLOCK_FIELD_DEFS: Record<string, BlockFieldDef[]> = {
  scenario: [
    { field: 'speaker', suffix: '話者', locked: false, width: 12 },
    { field: 'text', suffix: '本文', locked: false, width: 60 },
    { field: 'q', suffix: 'Q', locked: false, width: 4 },
    { field: 'image', suffix: '画像', locked: true, width: 20 },
  ],
  video: [
    { field: 'label', suffix: 'ID', locked: false, width: 14 },
    { field: 'memo', suffix: 'メモ', locked: false, width: 24 },
    { field: 'image', suffix: '画像', locked: true, width: 20 },
  ],
  audio: [
    { field: 'label', suffix: 'ID', locked: false, width: 14 },
    { field: 'memo', suffix: 'メモ', locked: false, width: 24 },
    { field: 'image', suffix: '画像', locked: true, width: 20 },
  ],
  telop: [
    { field: 'label', suffix: 'ID', locked: false, width: 14 },
    { field: 'memo', suffix: 'メモ', locked: false, width: 24 },
    { field: 'image', suffix: '画像', locked: true, width: 20 },
  ],
  slide: [
    { field: 'image', suffix: '画像', locked: true, width: 20 },
  ],
  audio_mic: [
    { field: 'summary', suffix: '', locked: true, width: 40 },
  ],
  led_xr: [
    { field: 'scene', suffix: 'シーン', locked: false, width: 16 },
    { field: 'cue', suffix: 'Cue', locked: false, width: 14 },
    { field: 'transition', suffix: 'トランジション', locked: false, width: 16 },
  ],
  lighting: [{ field: 'value', suffix: '', locked: false, width: 20 }],
  remarks: [{ field: 'value', suffix: '', locked: false, width: 24 }],
  item: [{ field: 'value', suffix: '', locked: false, width: 20 }],
  stage_diagram: [
    { field: 'template', suffix: 'ひな形', locked: false, width: 16 },
    { field: 'note', suffix: 'メモ', locked: false, width: 20 },
  ],
};

/** 11 ブロック型のうち、Excel から往復更新できるフィールドを持つ型（画像は除く）。 */
export const ROUNDTRIP_TYPES = new Set([
  'scenario', 'video', 'audio', 'telop', 'audio_mic', 'led_xr', 'lighting', 'remarks', 'item', 'stage_diagram',
]);
/** 書き出しのみ（往復不可）。slide は画像そのものなので、`.xlsx` からは変更できない。 */
export const WRITE_ONLY_TYPES = new Set(['slide']);

export function machineKey(type: string, ordinal: number, field: string): string {
  return `blk.${type}#${ordinal}.${field}`;
}

/** NFKC 正規化 + 空白除去（`shared/utils/excel.ts` の normalizeHeader と同じ規則。§8-3 ③④）。 */
export function normalizeHeader(v: unknown): string {
  return String(v ?? '').normalize('NFKC').replace(/\s+/g, '').trim();
}

/** 尺・ID など「文字列のまま持つ」列の Excel numFmt（§5-4）。Excel の時刻化を止める。 */
export const TEXT_NUM_FMT = '@';
