/**
 * テロップCG — 進行台本（Qシート）からの取り込み（graphics-redesign.md §9 1〜2・段C）。
 *
 * `graphicsRosterApi.ts`（名簿からの一括生成）と同じ切り出し方針
 * （ファイルサイズ規律・400行 — `node scripts/check-file-size.mjs`。`graphicsApi.ts` 本体との
 * 関わりが薄いこの節だけ独立させた）。
 *
 * サーバー側の契約（担当1・並行作業。`server/src/contexts/graphics/routes/qsheet-import.routes.ts`）:
 *   GET  /graphics/projects/:id/qsheet-import/preview?qsheetDocId=<id>
 *        … 台本のテロップ列から取り込み候補を作る（qsheet reader 可）。
 *          レスポンスは `{ docTitle, candidates }`
 *   POST /graphics/projects/:id/qsheet-import/commit
 *        … 選んだ候補をページとして一括作成する（qsheet editor 以上）。
 *          body: `{ qsheetDocId, items }` → 作成された `GraphicsPageRow[]` を返す
 *   GET  /graphics/projects/:id/qsheet-live-text
 *        … 取り込み済みページごとの「台本側のいまの文言」を取得する（差分検知用・qsheet reader 可）
 *
 * 台本へのアクセス制御（共有されていない他人の台本は読めない）はサーバー側
 * （`canAccessDoc`）が担う——ここは素通しの薄いラッパー。
 */
import api from '@/lib/api';
import type { GraphicsPageRow, GraphicsPartKey, GraphicsSlot } from '@/lib/graphicsApi';

/**
 * 台本から拾った取り込み候補1件（＝台本の1行×1つのテロップ列）。
 * **`qsheetRowId` は候補間で重複しうる**——1行に複数のテロップ列があれば、列ごとに
 * 別の候補として独立に並ぶ（サーバー側は重複排除しない設計・graphics-redesign.md §9）。
 * そのため配列のインデックスで管理すること（`qsheetRowId` を React の `key` にしない）。
 */
export interface QsheetImportCandidate {
  /** 台本の行の id。取り込むと `graphics_pages.qsheet_row_id` に入る */
  qsheetRowId: string;
  /** コーナー見出し（台本の section.label）。無ければ null */
  section: string | null;
  /** テロップの文言そのもの（台本の telop セルの entries[0].label。trim 済み・空文字は候補に含まれない） */
  text: string;
  /** entries[0].memo（補足。参考表示のみ・取り込み後は使わない） */
  memo: string;
  /** 文言から推定した種類（`inferPartKey`）。初期選択に使うだけで、確認画面で選び直せる */
  suggestedPartKey: GraphicsPartKey;
}

export interface QsheetImportPreviewResult {
  /** 選んだ台本のタイトル（確認画面の見出し表示用） */
  docTitle: string;
  candidates: QsheetImportCandidate[];
}

/** 台本を選んだ直後に呼ぶ（テロップ列が無い・文言が無い台本は `candidates: []` の正常応答） */
export async function previewQsheetImport(
  projectId: string,
  qsheetDocId: string,
): Promise<QsheetImportPreviewResult> {
  const { data } = await api.get(`/graphics/projects/${encodeURIComponent(projectId)}/qsheet-import/preview`, {
    params: { qsheetDocId },
  });
  return data.data;
}

/** 確認画面でチェックが付いた候補から組み立てる、取り込み確定1件ぶんの入力 */
export interface QsheetImportItem {
  qsheetRowId: string;
  section: string | null;
  slot: GraphicsSlot;
  partKey: GraphicsPartKey;
  name: string;
  fields: Record<string, unknown>;
}

export async function commitQsheetImport(
  projectId: string,
  qsheetDocId: string,
  items: QsheetImportItem[],
): Promise<GraphicsPageRow[]> {
  const { data } = await api.post(`/graphics/projects/${encodeURIComponent(projectId)}/qsheet-import/commit`, {
    qsheetDocId,
    items,
  });
  return data.data;
}

/** 取り込み済みページ1件ぶんの「台本側のいまの文言」（①の「台本と違います」バッジの判定材料） */
export interface QsheetLiveTextEntry {
  /**
   * サーバーは number で返す。型は `GraphicsPageRow.id` に合わせて `string` にしてあるが、
   * **ここで `String()` 変換はしない**——`GraphicsPageRow.id` 自身も `graphicsApi.ts` の
   * 他の関数（`createGraphicsPage`/`fetchGraphicsRequests` 等）が `data.data` を素通しして
   * いるだけで、実体（JSON 経由で届く値）は常に数値のまま。ここだけ本物の文字列に変換すると、
   * `GraphicsHubPage.tsx` 側の `pages.find((p) => p.id === entry.pageId)` が
   * 「数値 === 文字列」の比較になって常に false になり、`driftPageIds` が1件も検出できず
   * 「台本と違います」バッジが絶対に出なくなる（統合確認で実機を叩いて踏んだ不具合——
   * `npx tsc` は両辺とも型上は `string` なので検出できない）。`GraphicsPageRow.id` と
   * 同じ「型は string・実体は number」のまま扱うことで、`page.id === entry.pageId` の
   * 比較を成立させる。
   */
  pageId: string;
  /** 台本・行・テロップ列のいずれかが見つからない（削除済み等）ときは null。
   *  差分ありとは判定しない——呼び出し側（`GraphicsHubPage`）の役割 */
  liveText: string | null;
}

export async function fetchQsheetLiveText(projectId: string): Promise<QsheetLiveTextEntry[]> {
  const { data } = await api.get(`/graphics/projects/${encodeURIComponent(projectId)}/qsheet-live-text`);
  return data.data;
}
