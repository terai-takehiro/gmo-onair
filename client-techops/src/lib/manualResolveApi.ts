// 運営マニュアル — 差し込みブロック（段C）の API 呼び出しの薄いラッパー。
// `manualApi.ts` と同じ作法（契約: docs/design/v4/production-manual.md §5-4）。
//
// ⚠️ ここが呼ぶ3本（resolve・link-catalog・link-sources）は Integrate フェーズで
// サーバー側が実装される（このファイルを書いている時点ではまだ存在しない）。
// 「この形で呼べば返る」という契約だけを信じてラッパーを書いている。
import api from "@/lib/api";
import type { ManualLinkedBlockKey } from "@gmo-onair/shared/src/production/manualBlocks";

interface Envelope<T> {
  success: boolean;
  data: T;
}

/** `resolve` の1ブロックぶんの結果。段Cの範囲では `frozen` は常に null（確定は段E） */
export interface ManualResolveEntry {
  data: unknown;
  updatedAt: string | null;
  error?: string;
}

/**
 * そのマニュアルの全ページを走査し、`kind:'linked'` の全ブロックを解決してまとめて返す
 * （キーは `ManualBlock.id`）。同じ差し込み元が複数ブロックにあっても、サーバー側で
 * 1回だけ解決してから全 blockId にマップし直して返す（呼び出し側の1回で足りる）。
 */
export async function getManualResolve(manualId: string): Promise<Record<string, ManualResolveEntry>> {
  const res = await api.get<Envelope<{ results: Record<string, ManualResolveEntry> }>>(
    `/techops/manuals/${manualId}/resolve`,
  );
  return res.data.data.results;
}

/**
 * このマニュアルの project_id/program_id に対して「実在する」差し込みブロック種別だけを返す
 * （§4-3「押すと空になる項目を作らない」）。載っていない種別は `InsertPanel` でグレーアウトする。
 */
export async function getLinkCatalog(manualId: string): Promise<ManualLinkedBlockKey[]> {
  const res = await api.get<Envelope<{ available: ManualLinkedBlockKey[] }>>(
    `/techops/manuals/${manualId}/link-catalog`,
  );
  return res.data.data.available;
}

export interface ManualLinkSource {
  id: string;
  label: string;
}

/**
 * `sourceId` が要るブロック種別（sheet.rundown/sheet.excerpt/sheet.micAssignment）だけ
 * 複数件を返す。それ以外の種別は空配列（呼び出し側は「1件なら選ばせずそのまま置く」判断に使う）。
 */
export async function getLinkSources(
  manualId: string,
  blockKey: ManualLinkedBlockKey,
): Promise<ManualLinkSource[]> {
  const res = await api.get<Envelope<{ sources: ManualLinkSource[] }>>(
    `/techops/manuals/${manualId}/link-sources`,
    { params: { block: blockKey } },
  );
  return res.data.data.sources;
}
