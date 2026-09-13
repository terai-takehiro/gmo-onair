// 右パネルの体制図（`OrgChartInspector`）と、取り込みの実処理をつなぐ薄い層
// （production-manual-orgchart.md §5-4・§5-5）。
//
// `OrgChartInspector` は「押された」ことを伝えるだけで通信を持たない（表示に専念する）。
// ここが `GET /techops/manuals/:id/org-seed` を引き、`orgChartSeed.ts` の純粋関数で
// いまの中身に流し込み、`onCommit` で1手ぶんだけ commit する
// （= undo の1手・自動保存1回ぶん。`BlockInspector` → `ManualDetailPage` → `ManualCanvas` の
// `useManualHistory.commit` に届く）。
//
// `BlockInspector.tsx` に直接書かないのは、あちらが 219 行で 400 行のラチェットに近いのと、
// 通信・キャッシュの話を書式パネルに持ち込まないため。
//
// ⚠️ **いまの「出す項目」（`resolveOrgChartShow`）を流し込みへ渡す。** 切れている項目は
// キャンバスに出ず入力欄も出ないので、そのまま保存すると押した人に見えない
// （電話・メールは個人の連絡先なので特に）。判断は `orgChartSeed.ts` の `toPerson`。
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ManualOrgChartContent } from "@gmo-onair/shared/src/opsmanual/types";
import { getManualOrgSeed } from "@/lib/manualApi";
import { notifyInfo, notifyError } from "@/lib/notify";
import OrgChartInspector, { type ManualOrgSeedKind } from "./OrgChartInspector";
import { resolveOrgChartShow } from "./blocks/orgchart/orgChartUi";
import { countSeedPeople, mergeGpmTiers, mergeProjectMembers } from "./orgChartSeed";

interface Props {
  manualId: string;
  content: ManualOrgChartContent;
  onCommit: (content: ManualOrgChartContent) => void;
}

export default function OrgChartInspectorSection({ manualId, content, onCommit }: Props) {
  const [seeding, setSeeding] = useState<ManualOrgSeedKind | null>(null);

  // 取り込み元の件数をボタンの脇に出すため、体制図を選んだ時点で引いておく
  // （どちらも 0 なら区画ごと畳む ＝ 番組のマニュアル・§5-5）。
  // 元は他の人の操作でも変わるが、開くたびに毎回引き直すほどではない（resolve と同じ扱い）
  const seedQuery = useQuery({
    queryKey: ["manuals", manualId, "org-seed"],
    queryFn: () => getManualOrgSeed(manualId),
    enabled: !!manualId,
    staleTime: 30_000,
  });

  const seed = seedQuery.data;
  const handleSeed = async (kind: ManualOrgSeedKind, targetTierId: string | null) => {
    setSeeding(kind);
    try {
      // 押した時点でまだ引けていない（初回・失敗後）ときはここで引き直す
      const data = seed ?? (await seedQuery.refetch()).data;
      if (!data) {
        notifyError("取り込み元を読み込めませんでした。", { description: "少し待ってから、もう一度お試しください。" });
        return;
      }
      const show = resolveOrgChartShow(content);
      const result =
        kind === "project"
          ? mergeProjectMembers(content, targetTierId, data.projectMembers, show)
          : mergeGpmTiers(content, data.gpmTiers, show);
      // 足すものが1つも無いときは commit しない——何も変わっていない1手を undo 履歴と
      // 自動保存に積まないため。黙って終わると「押したのに何も起きない」ので、
      // **なぜ入らなかったのか**まで知らせる（入れる先が無いのと重複は理由が違う）
      if (result.status === "no-tier") {
        notifyInfo("まだ階層がありません。", { description: "先に「階層を足す」で階層を1つ作ってください。" });
        return;
      }
      if (result.status === "none") {
        notifyInfo("足す人はいませんでした。", { description: "同じ名前の人はもう入っています。" });
        return;
      }
      onCommit(result.content);
    } catch {
      notifyError("取り込めませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    } finally {
      setSeeding(null);
    }
  };

  return (
    <OrgChartInspector
      content={content}
      onCommit={onCommit}
      onSeed={handleSeed}
      seedCounts={seed ? { project: seed.projectMembers.length, gpm: countSeedPeople(seed.gpmTiers) } : undefined}
      seeding={seeding}
    />
  );
}
