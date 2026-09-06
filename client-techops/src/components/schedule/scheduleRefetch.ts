// リフェッチ・キャッシュ無効化のヘルパー。`SchedulePage.tsx` から抜き出した
// （400行基準・`npm run lint` の `check-file-size.mjs`）。
// ⚠️ 名前は `use` で始めない（React hooks ではなく、キャッシュキーを invalidate する
// だけの素の関数）。`SchedulePage.tsx` の `if (!id) return null;` より後でも
// 呼べるようにするため、あえて hooks の呼び出し順の制約を受けない形にしてある。
import type { QueryClient } from "@tanstack/react-query";
import type { NavigateFunction } from "react-router-dom";

export interface ScheduleOwnerRef { project_id?: string | null; program_id?: string | null }

export function createScheduleRefetchers(
  id: string,
  queryClient: QueryClient,
  navigate: NavigateFunction,
  getOwner: () => ScheduleOwnerRef | undefined,
) {
  const refetchDetail = () => queryClient.invalidateQueries({ queryKey: ["schedule", id] });
  const refetchBreakdown = () => queryClient.invalidateQueries({ queryKey: ["schedule-breakdown", id] });
  // 項目（枠）を足す/直す/消す/台本化すると、一覧（`ScheduleListPage.tsx` の ["schedules","list",...]）と
  // ハブ画面（`JourneyPage.tsx` の ["qsheet-journey", scope, id]）が読む件数・提案が古いまま残る
  // （既定の staleTime=60秒。監査 2026-08-24）。この2つも合わせて invalidate する。
  const refetchListsAndHub = () => {
    queryClient.invalidateQueries({ queryKey: ["schedules", "list"] });
    const owner = getOwner();
    if (owner?.project_id) {
      queryClient.invalidateQueries({ queryKey: ["qsheet-journey", "project", owner.project_id] });
    } else if (owner?.program_id) {
      queryClient.invalidateQueries({ queryKey: ["qsheet-journey", "program", owner.program_id] });
    } else {
      // owner がまだ分からない（読み込み中 等）ときは絞り込めないので全ジャーニーを対象にする
      queryClient.invalidateQueries({ queryKey: ["qsheet-journey"] });
    }
  };
  // 列を消すと中の項目も消える（件数が動く）ので、列の変更は一覧・ハブまで読み直す
  const refetchAfterColumns = () => { refetchDetail(); refetchBreakdown(); refetchListsAndHub(); };
  // 表の設定は案件/番組そのものを付け替えられる。旧・新どちらのハブが古くなるか
  // 事前には分からないので、ジャーニー全体を読み直す（表の設定はそう何度も開かない操作）
  const refetchAfterSettings = () => {
    refetchDetail();
    queryClient.invalidateQueries({ queryKey: ["schedules", "list"] });
    queryClient.invalidateQueries({ queryKey: ["qsheet-journey"] });
  };
  const handleDeleted = () => {
    queryClient.invalidateQueries({ queryKey: ["schedules", "list"] });
    navigate("/techops/schedules");
  };
  return { refetchDetail, refetchBreakdown, refetchListsAndHub, refetchAfterColumns, refetchAfterSettings, handleDeleted };
}
