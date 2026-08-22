import { useEffect } from "react";
import { setProductionNavContext } from "@/lib/productionNavContext";

/**
 * いま開いている進行台本 (doc) の project_id / program_id を
 * `productionNavContext.ts` に記録し、サイドバー・スマホ下タブ
 * (`components/layout/nav.ts` の `buildQsheetNav`) が「いまの案件/番組」を
 * 判定できるようにする (2026-08-22)。
 *
 * `EditorPage.tsx` はもともと 400 行上限の超過ファイルなので、
 * ロジックはここに切り出してページ側の増加を最小限にしている。
 *
 * project_id / program_id のどちらも無い (=まだ紐付いていない) doc のときは呼ばない。
 */
export function useSyncDocProductionNavContext(projectId: unknown, programId: unknown): void {
  useEffect(() => {
    if (typeof projectId === "string" && projectId) {
      setProductionNavContext({ scope: "project", id: projectId, label: null });
    } else if (typeof programId === "string" && programId) {
      setProductionNavContext({ scope: "program", id: programId, label: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, programId]);
}
