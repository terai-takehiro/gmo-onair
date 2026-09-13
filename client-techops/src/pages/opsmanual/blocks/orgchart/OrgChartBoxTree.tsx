// 体制図の「箱＋その下にぶら下がる子」を再帰的に描く（木構造の分岐・2026-09-13 の利用者判断
// 「上下だけでなく分岐にも対応」）。子は `box.parentId` で見つける — `tiers` の並びは
// 「どの階層のデータか」という分類のままで、実際の親子関係はここで解決する。
//
// ⚠️ **SVG で座標を計算して線を引かない**（`OrgChartBlockContent.tsx` 冒頭の注記と同じ理由）。
// 箱＋子の並びを `flex flex-col` の入れ子にし、線は幅が伸び縮みしても崩れない
// 固定太さの短い罫（`h-3 w-px`）だけで描く。
import OrgChartTeamBox, { type ParentOption } from "./OrgChartTeamBox";
import type { ManualOrgBox } from "@gmo-onair/shared/src/opsmanual/types";
import type { OrgChartShow } from "./orgChartUi";

interface Props {
  box: ManualOrgBox;
  allBoxes: ManualOrgBox[];
  show: OrgChartShow;
  connectors: boolean;
  selected: boolean;
  onChange: (boxId: string, next: ManualOrgBox) => void;
  onRemove: (boxId: string) => void;
  /** この箱が選べる「親」の候補（自分より手前の階層の箱から自分の子孫を除いたもの） */
  parentOptionsOf: (boxId: string) => ParentOption[];
  /** 顔写真アップロードが終わった時点で呼ぶ（id を頼りに最新の中身へ差し込む・レビュー指摘） */
  onPersonPhotoUploaded: (personId: string, photoUrl: string) => void;
  /** 循環データが紛れ込んだときの無限ループ避け（通常は tier の前後関係だけで循環しない） */
  ancestorIds?: ReadonlySet<string>;
}

export default function OrgChartBoxTree({
  box, allBoxes, show, connectors, selected, onChange, onRemove, parentOptionsOf, onPersonPhotoUploaded, ancestorIds,
}: Props) {
  if (ancestorIds?.has(box.id)) return null; // 防御的（実際には起こらない想定）
  const nextAncestors = ancestorIds ? new Set(ancestorIds).add(box.id) : new Set([box.id]);
  const children = allBoxes.filter((b) => b.parentId === box.id);

  return (
    <div className="flex min-w-0 flex-1 flex-col items-stretch gap-1.5">
      <OrgChartTeamBox
        box={box}
        show={show}
        selected={selected}
        onChange={(next) => onChange(box.id, next)}
        onRemove={() => onRemove(box.id)}
        parentOptions={parentOptionsOf(box.id)}
        parentId={box.parentId ?? null}
        onChangeParent={(parentId) => onChange(box.id, { ...box, parentId })}
        onPersonPhotoUploaded={onPersonPhotoUploaded}
      />
      {children.length > 0 && (
        <div className="flex flex-col items-center gap-1.5">
          {connectors ? <div className="h-3 w-px bg-fg-disabled" aria-hidden="true" /> : <div className="h-1.5" aria-hidden="true" />}
          <div className="flex w-full items-start gap-1.5">
            {children.map((child) => (
              <OrgChartBoxTree
                key={child.id}
                box={child}
                allBoxes={allBoxes}
                show={show}
                connectors={connectors}
                selected={selected}
                onChange={onChange}
                onRemove={onRemove}
                parentOptionsOf={parentOptionsOf}
                onPersonPhotoUploaded={onPersonPhotoUploaded}
                ancestorIds={nextAncestors}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
