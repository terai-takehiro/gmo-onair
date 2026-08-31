/**
 * テロップCG — 名簿（Excel）からのページ一括生成（graphics.md §6・§9 段5）。
 *
 * `graphicsApi.ts` から切り出した（ファイルサイズ規律・400行 — `node scripts/check-file-size.mjs`。
 * テンプレート機能の追加で本体が閾値を超えたため、部品ライブラリ/テンプレート/ページCRUDと
 * 関わりの薄いこの節だけ独立させた。呼び出し側の import 元だけが変わり、契約・挙動は不変）。
 *
 * サーバー側の契約:
 *   POST /graphics/projects/:id/roster/preview … ヘッダー・サンプル行・列の型自動判定
 *                                                  （＋渡した候補があれば推奨マッピング）を読む
 *   POST /graphics/projects/:id/roster/commit  … 全行をパースして一括作成（dryRun で件数だけ確認も可）
 */
import api from '@/lib/api';
import type { GraphicsPageRow, GraphicsPartKey, GraphicsSlot } from '@/lib/graphicsApi';

/** 列の自動分類タイプ（サーバー側 `roster-import.service.ts` の `RosterColumnType` と同じ）。
 *  awards ほど細かくない5種（空/数値/日付/短文/長文）で足りる（§2-2の8番）。 */
export type RosterColumnType = 'empty' | 'number' | 'date' | 'shortText' | 'longText';

/** 推奨マッピングを計算するための候補（`PART_FIELDS` の key/label をそのまま渡す）。 */
export interface RosterFieldCandidate {
  key: string;
  label: string;
}

export interface RosterColumnAnalysis {
  header: string;
  type: RosterColumnType;
  filledRatio: number;
  samples: string[];
  suggestedKey?: string;
  suggestedConfidence: 'exact' | 'partial' | 'none';
}

export interface RosterPreviewResult {
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
  /** 列ごとの型自動判定＋推奨マッピング（`fieldCandidates` を渡さなかった呼び出しでは
   *  `suggestedConfidence` が全列 `'none'` のまま返る） */
  columns: RosterColumnAnalysis[];
}

export async function previewGraphicsRoster(
  projectId: string,
  file: File,
  fieldCandidates?: RosterFieldCandidate[],
): Promise<RosterPreviewResult> {
  const fd = new FormData();
  fd.append('file', file);
  if (fieldCandidates && fieldCandidates.length > 0) {
    fd.append('fieldCandidates', JSON.stringify(fieldCandidates));
  }
  const { data } = await api.post(`/graphics/projects/${encodeURIComponent(projectId)}/roster/preview`, fd);
  return data.data;
}

export interface RosterCommitResult {
  created: GraphicsPageRow[];
  createdCount: number;
  /** 全カラム空だったためスキップした行数 */
  skippedBlank: number;
  /** ページ名が空になり作成できなかった行（1行のミスで全部は失敗させない） */
  errors: { row: number; message: string }[];
  /** true なら dry-run の結果（DB へは書き込んでいない。`created` は常に空） */
  dryRun: boolean;
}

export async function commitGraphicsRoster(
  projectId: string,
  file: File,
  slot: GraphicsSlot,
  partKey: GraphicsPartKey,
  mapping: Record<string, string>,
  nameColumn?: string,
  dryRun?: boolean,
): Promise<RosterCommitResult> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('slot', slot);
  fd.append('partKey', partKey);
  fd.append('mapping', JSON.stringify(mapping));
  if (nameColumn) fd.append('nameColumn', nameColumn);
  if (dryRun) fd.append('dryRun', 'true');
  const { data } = await api.post(`/graphics/projects/${encodeURIComponent(projectId)}/roster/commit`, fd);
  return data.data;
}
