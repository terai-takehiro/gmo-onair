// 制作技術支援トップ（/techops/top）— API 呼び出しの薄いラッパー。
// サーバー: server/src/contexts/qsheet/routes/top.routes.ts
import api from "@/lib/api";

interface Envelope<T> { success: boolean; data: T }

export type TopItemKind = "gls" | "own";

export interface TopItem {
  kind: TopItemKind;
  id: string;
  name: string;
  gls_number: string | null;
  customer_name: string | null;
  /** 直近の本番・収録（きょう以降でいちばん近い日）。無ければ null */
  next_date: string | null;
  /** 最後の回・実施日。アーカイブ判定（「最後の回の翌日」）に使う */
  last_date: string | null;
  /**
   * 案件のステージ（`a_won`＝受注済 など）。ここだけの番組（`kind==='own'`）は `null`。
   * **日付を1つも持たない案件をアーカイブへ畳むため**にだけ使う（`topHelpers.ts` の
   * `isArchived`）。工事・構築のプロジェクト（旧 GLS-B・`GMO-` 系列）と失注は
   * サーバーの時点で除いてある（`server/.../qsheet/routes/top.routes.ts`）
   */
  stage: string | null;
  /** 改番で退役した旧番号（例 GLS-A012）。無ければ空配列。検索で旧番号にも当てるため（§4.10） */
  retired_numbers: string[];
}

export async function listTopItems(): Promise<TopItem[]> {
  const res = await api.get<Envelope<TopItem[]>>("/techops/top-items");
  return res.data.data;
}
