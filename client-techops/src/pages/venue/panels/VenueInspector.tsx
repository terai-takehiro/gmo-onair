// 会場図面 — 右パネル「選んだ品目の設定」（設計: docs/design/v4/venue-layout.md §6②）。
// 何も選んでいなければ図面の情報、1個選べば品目の設定、並べたグループを選べば
// グループの設定（並べ直す・グループ解除）を出す。表示の組み立てだけをここに置き、
// 実際の描画は `VenueInspectorPanel.tsx`（3ケース共通の見た目）に任せる。
import { useEffect, useState } from "react";
import type { VenueArea, VenueCatalogItem, VenueFloor, VenueItem } from "@gmo-onair/shared/src/venue/types";
import { computeBBox, isItemOverflowing, itemFootprintSize } from "@gmo-onair/shared/src/venue/geometry";
import { translateArrangeResult, type VenueArrangeParams } from "@gmo-onair/shared/src/venue/arrange";
import { normalizeAngle } from "@/pages/opsmanual/manualCanvasGeometry";
import { deleteItems, duplicateItems, groupMembers, reorderZItems, ungroupItems } from "../venueItemOps";
import { ARRANGE_FIELDS, ARRANGE_USED_ITEMS, PRESET_LABEL, computeArrangeResult, summarizeArrangeResult } from "../venueArrangeConfig";
import VenueInspectorPanel, { type InspectorButton, type InspectorPanelData, type InspectorStepper } from "./VenueInspectorPanel";

interface Props {
  floor: VenueFloor;
  area: VenueArea;
  catalog: VenueCatalogItem[];
  items: VenueItem[];
  selectedIds: string[];
  editable: boolean;
  onCommit: (next: VenueItem[]) => void;
  onSelectionChange: (ids: string[]) => void;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("ja-JP");
}

function itemSizeText(item: VenueItem, catalog?: VenueCatalogItem): string {
  if (item.points) return `長さ ${fmt(itemFootprintSize(item).w)} mm`;
  if (typeof item.diameter === "number") return `Ø${fmt(item.diameter)} mm`;
  if (typeof item.w === "number" && typeof item.d === "number") return `${fmt(item.w)} × ${fmt(item.d)} mm`;
  return catalog?.label ?? "—";
}

export default function VenueInspector({ floor, area, catalog, items, selectedIds, editable, onCommit, onSelectionChange }: Props) {
  const catalogByKey = new Map(catalog.map((c) => [c.key, c]));
  const groupId = selectedIds.length > 0 ? items.find((it) => it.id === selectedIds[0])?.groupId : undefined;
  const wholeGroupSelected = !!groupId && groupMembers(items, groupId).every((m) => selectedIds.includes(m.id)) && groupMembers(items, groupId).length === selectedIds.length;
  const singleItem = selectedIds.length === 1 ? items.find((it) => it.id === selectedIds[0]) : undefined;

  const [draftParams, setDraftParams] = useState<VenueArrangeParams>({});
  useEffect(() => {
    if (wholeGroupSelected && groupId) {
      const members = groupMembers(items, groupId);
      setDraftParams((members[0]?.arrange?.params as VenueArrangeParams) ?? {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, wholeGroupSelected]);

  let data: InspectorPanelData;

  if (singleItem && !wholeGroupSelected) {
    const it = singleItem;
    const cat = it.key ? catalogByKey.get(it.key) : undefined;
    const overflowing = isItemOverflowing(it, area, floor.fixtures);
    const n = it.key ? items.filter((x) => x.key === it.key).length : 0;
    const overStock = !!cat?.qty && n > cat.qty;
    const patch = (p: Partial<VenueItem>) => onCommit(items.map((x) => (x.id === it.id ? { ...x, ...p } : x)));
    const isShape = it.kind === "shape" || it.kind === "text";
    const steppers: InspectorStepper[] = [
      { label: "向き（度）", value: `${it.rotation}°`, onDec: () => patch({ rotation: normalizeAngle(it.rotation - 15) }), onInc: () => patch({ rotation: normalizeAngle(it.rotation + 15) }) },
    ];
    if (isShape && !it.points) {
      if (typeof it.diameter === "number") {
        steppers.push({ label: "直径", value: fmt(it.diameter), onDec: () => patch({ diameter: Math.max(100, it.diameter! - 100) }), onInc: () => patch({ diameter: it.diameter! + 100 }) });
      } else {
        steppers.push({ label: "幅", value: fmt(it.w ?? 0), onDec: () => patch({ w: Math.max(100, (it.w ?? 100) - 100) }), onInc: () => patch({ w: (it.w ?? 0) + 100 }) });
        steppers.push({ label: "奥行", value: fmt(it.d ?? 0), onDec: () => patch({ d: Math.max(100, (it.d ?? 100) - 100) }), onInc: () => patch({ d: (it.d ?? 0) + 100 }) });
      }
    }
    if (it.kind === "camera" && cat) {
      steppers.push({ label: "アームの角度", value: `${it.armAngle ?? 0}°`, onDec: () => patch({ armAngle: normalizeAngle((it.armAngle ?? 0) - 15) }), onInc: () => patch({ armAngle: normalizeAngle((it.armAngle ?? 0) + 15) }) });
    }

    const buttons: InspectorButton[] = [
      { label: "反転", onClick: () => patch({ rotation: normalizeAngle(it.rotation + 180) }) },
      { label: "前面へ", onClick: () => onCommit(reorderZItems(items, [it.id], "front")) },
      { label: "背面へ", onClick: () => onCommit(reorderZItems(items, [it.id], "back")) },
      { label: it.locked ? "固定を解除" : "固定", onClick: () => patch({ locked: !it.locked }) },
      { label: "複製", onClick: () => { const r = duplicateItems(items, [it.id]); onCommit(r.items); onSelectionChange(r.newIds); } },
      { label: "削除", danger: true, onClick: () => { onCommit(deleteItems(items, [it.id])); onSelectionChange([]); } },
    ];

    data = {
      title: cat?.label ?? (it.kind === "shape" ? "図形" : it.kind === "text" ? "文字" : it.kind === "dimension" ? "寸法線" : "品目"),
      badge: it.kind === "camera" ? "カメラ" : it.kind === "person" ? "人" : it.kind === "shape" || it.kind === "text" || it.kind === "line" || it.kind === "dimension" ? "図形" : "備品",
      rows: [
        { label: "寸法", value: itemSizeText(it, cat) },
        { label: "位置 X", value: `${fmt(it.x - area.bboxMm.x)} mm` },
        { label: "位置 Y", value: `${fmt(it.y - area.bboxMm.y)} mm` },
        ...(cat ? [{ label: "保有", value: cat.qty != null ? `${n} / ${cat.qty} ${cat.unit ?? ""} ・ ${cat.storage ?? "—"}` : (cat.storage ?? "—"), danger: overStock }] : []),
        ...(cat?.estimated ? [{ label: "寸法の根拠", value: "推定（メーカー寸法図で確定）" }] : []),
        ...(overflowing ? [{ label: "はみ出し", value: "エリアの外に出ています", danger: true }] : []),
      ],
      steppers: editable && !it.locked ? steppers : [],
      buttons: editable ? buttons : [],
      warning: overStock ? { title: "保有数を超えています", body: `保有数 ${cat!.qty}${cat!.unit ?? ""} に対して ${n}${cat!.unit ?? ""} 置いています。置くのは止めません。` } : null,
      note: isShape
        ? { title: "この図形は寸法を変えられます", body: "右の欄で数値を変えられます（つまみでも伸ばせます）。名前を付けると札に出ます。" }
        : { title: "実寸固定（伸ばせません）", body: "伸ばしたいものは「四角」で置きます。矢印キーで10mm（Shift 100mm・Ctrl 1mm）動き、Ctrl+Dで複製、Deleteで削除。" },
    };
  } else if (wholeGroupSelected && groupId) {
    const members = groupMembers(items, groupId);
    const preset = (members[0]?.arrange?.preset as keyof typeof PRESET_LABEL) ?? "theater";
    const gridItem = draftParams.itemKey ? catalogByKey.get(String(draftParams.itemKey)) : undefined;
    const preview = computeArrangeResult(preset, draftParams, gridItem, groupId);
    const summary = summarizeArrangeResult(preview, catalogByKey);
    const overCount = members.filter((m) => isItemOverflowing(m, area, floor.fixtures)).length;
    const bbox = computeBBox(members) ?? { x: area.bboxMm.x, y: area.bboxMm.y, w: 0, h: 0 };

    const relayout = () => {
      const anchor = computeBBox(members) ?? bbox;
      const next = translateArrangeResult(
        { ...preview, items: preview.items.map((it) => ({ ...it, groupId, arrange: { preset, params: draftParams } })) },
        anchor.x, anchor.y,
      );
      onCommit([...items.filter((it) => it.groupId !== groupId), ...next]);
    };

    data = {
      title: `${PRESET_LABEL[preset]}（並べたグループ）`, badge: "グループ",
      rows: [
        { label: "並べ方", value: PRESET_LABEL[preset] },
        { label: "品目", value: ARRANGE_USED_ITEMS[preset] },
        { label: "点数", value: `${members.length} 点`, danger: summary.isOverStock },
        { label: "外接寸法", value: `${fmt(bbox.w)} × ${fmt(bbox.h)} mm` },
        { label: "はみ出し", value: `${overCount} 点`, danger: overCount > 0 },
      ],
      steppers: editable
        ? (ARRANGE_FIELDS[preset] ?? []).map((f) => ({
            label: f.label, value: String(Number(draftParams[f.key] ?? "") || "既定"),
            onDec: () => setDraftParams((p) => ({ ...p, [f.key]: Math.max(f.min, Number(p[f.key] ?? 0) - f.step) })),
            onInc: () => setDraftParams((p) => ({ ...p, [f.key]: Math.min(f.max, Number(p[f.key] ?? 0) + f.step) })),
          }))
        : [],
      buttons: editable
        ? [
            { label: "並べ直す", primary: true, onClick: relayout },
            { label: "グループ解除", onClick: () => onCommit(ungroupItems(items, groupId)) },
            { label: "削除", danger: true, onClick: () => { onCommit(deleteItems(items, members.map((m) => m.id))); onSelectionChange([]); } },
          ]
        : [],
      warning: summary.isOverStock ? { title: "保有数を超えています", body: "置くのは止めません（確保できない場合があります）。" } : null,
      note: { title: "このグループの直し方", body: "① 数値を変えて「並べ直す」（1手で戻せます）② 中の1つはダブルクリックで動かす・削除（グループから外れます）③「グループ解除」で全部を個別に。" },
    };
  } else if (selectedIds.length > 1) {
    data = {
      title: `${selectedIds.length}点を選択中`,
      rows: [{ label: "操作", value: "道具の帯の整列・等間隔・重なりが使えます" }],
      note: { title: "複数選択", body: "Shiftを押しながら押すと足し引きできます。ドラッグで囲んでも選べます。" },
    };
  } else {
    const overCount = items.filter((it) => isItemOverflowing(it, area, floor.fixtures)).length;
    data = {
      title: "図面の情報", badge: floor.floorLabel,
      rows: [
        { label: "会場", value: floor.venueName },
        { label: "階", value: floor.floorLabel },
        { label: "エリア", value: area.label },
        { label: "内法", value: `${fmt(area.bboxMm.w)} × ${fmt(area.bboxMm.h)} mm${area.drawnAreaM2 ? ` ・ ${area.drawnAreaM2}㎡` : ""}` },
        { label: "縮尺", value: floor.verifiedAt ? `確認済み ${floor.verifiedAt.slice(0, 10)}${floor.verifiedByName ? " " + floor.verifiedByName : ""}` : "未確認", danger: !floor.verifiedAt },
        { label: "品目", value: `${items.length} 点 ・ はみ出し ${overCount} 件`, danger: overCount > 0 },
      ],
      note: { title: "品目を押すと選べます", body: "備品・人・カメラは実寸固定（伸ばせません）。伸ばしたいものは「四角」で置きます。ズームは道具の帯の −／＋、階とエリアの切替も帯の右にあります。" },
    };
  }

  return <VenueInspectorPanel data={data} />;
}
