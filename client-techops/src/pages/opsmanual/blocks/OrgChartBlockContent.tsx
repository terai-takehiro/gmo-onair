// 自由ブロック「体制図」の中身（production-manual-orgchart.md §4・§5-2）。
// 階層（上下）→ チーム（横並び）→ 人 の3段構えを、表ブロックと同じ作法で描く:
// **選択中だけ入力欄になり、選択していないときの見た目がそのまま紙に出る**
// （印刷とスマホ閲覧は `ManualPrintDocument` が `selected: false` で同じ関数を呼ぶ）。
//
// ⚠️ **SVG で座標を計算して線を引かない**（§4）。チームの高さは中の人数で変わるので、
// ブロックの幅を変えるたびに線がずれる（`client/src/contexts/gpm/pages/projectDetail/MembersTab.tsx`
// 冒頭が実測で書き残した理由。キャンバスでは利用者がブロックの幅を変えるぶん条件が悪い）。
// **上下のつながりは CSS の細い縦罫だけ**で示し、横の並びは「同じ階層にある」ことで表す。
//
// ⚠️ **立場（自社／発注者／PM会社／業者）の区分は持たない**（§10-2）。枠線はどのチームも
// 同じ細い実線で、塗らない（§4・インクを使わない）。どこの会社かはチームの見出しの
// 所属の文字で読む。プロジェクト管理の立場ごとの色分けはここへ持ち込まない。
import { Minus, Plus } from "lucide-react";
import BufferedInput from "@/components/editor/BufferedInput";
import { cn } from "@/lib/utils";
import { genId } from "@/lib/stableIds";
import { isInteractiveClickTarget } from "../manualCanvasGeometry";
import type {
  ManualOrgBox, ManualOrgChartContent, ManualOrgTier,
} from "@gmo-onair/shared/src/opsmanual/types";
import OrgChartBoxTree from "./orgchart/OrgChartBoxTree";
import type { ParentOption } from "./orgchart/OrgChartTeamBox";
import { ORG_INPUT, ORG_MINUS, ORG_PLUS, resolveOrgChartShow } from "./orgchart/orgChartUi";

interface Props {
  content: ManualOrgChartContent;
  selected: boolean;
  onCommit: (content: ManualOrgChartContent) => void;
}

/**
 * 中身が空のまま読まれたときの受け皿（置いた直後は名前の無い階層が1つ・§10-1）。
 * **描くたびに `genId` を呼ばない** — id が毎回変わると React の key が動き、
 * 打っている最中の入力欄からフォーカスが飛ぶ。
 */
const FALLBACK_TIERS: ManualOrgTier[] = [{ id: "tier_1", label: "", boxes: [] }];

export default function OrgChartBlockContent({ content, selected, onCommit }: Props) {
  const tiers = content.tiers?.length ? content.tiers : FALLBACK_TIERS;
  const show = resolveOrgChartShow(content);
  const connectors = content.connectors ?? true;

  // 更新はすべて作り直し（map / filter）。`useManualHistory` は過去の blocks を
  // そのまま持っているので、中身を書き換えると undo が壊れる
  const setTiers = (next: ManualOrgTier[]) => onCommit({ ...content, tiers: next });
  const patchTier = (id: string, fn: (t: ManualOrgTier) => ManualOrgTier) =>
    setTiers(tiers.map((t) => (t.id === id ? fn(t) : t)));
  const setBoxes = (id: string, next: ManualOrgBox[]) => patchTier(id, (t) => ({ ...t, boxes: next }));

  // 分岐（木構造）: 箱の実データは今までどおり「どの階層に属するか」で `tiers[i].boxes` に
  // 入ったままだが、描く場所は `parentId` が決める（`OrgChartBoxTree.tsx`）。id から
  // 「実際にどの階層の配列に入っているか」を引ければ、木のどこにいる箱でも
  // 同じ2関数（`updateBox`/`removeBox`）で読み書きできる。
  const allBoxes: ManualOrgBox[] = tiers.flatMap((t) => t.boxes ?? []);
  const boxIds = new Set(allBoxes.map((b) => b.id));
  const tierIndexOfBox = new Map<string, number>();
  tiers.forEach((t, i) => (t.boxes ?? []).forEach((b) => tierIndexOfBox.set(b.id, i)));
  /** 親を持たない（未設定・削除済みの親を指す）箱か = その箱が属する階層の行に独立して並ぶ */
  const isRootBox = (b: ManualOrgBox) => !b.parentId || !boxIds.has(b.parentId);
  /** 選べる親の候補 = 自分より**手前の階層**の箱だけ（この前後関係だけで循環を防ぐ） */
  const parentOptionsOf = (boxId: string): ParentOption[] => {
    const ti = tierIndexOfBox.get(boxId);
    if (ti == null || ti === 0) return [];
    return tiers.slice(0, ti).flatMap((t) => (t.boxes ?? []).map((b): ParentOption => ({ id: b.id, label: b.label })));
  };
  const updateBox = (boxId: string, next: ManualOrgBox) => {
    const ti = tierIndexOfBox.get(boxId);
    if (ti == null) return;
    const t = tiers[ti];
    setBoxes(t.id, (t.boxes ?? []).map((b) => (b.id === boxId ? next : b)));
  };
  // 削除は子を道連れにしない——親を失った子は「親を指せなくなった箱」として自分の
  // 階層の行に独立して戻る（isRootBox が boxIds に無い parentId を根として扱うため）
  const removeBox = (boxId: string) => {
    const ti = tierIndexOfBox.get(boxId);
    if (ti == null) return;
    const t = tiers[ti];
    setBoxes(t.id, (t.boxes ?? []).filter((b) => b.id !== boxId));
  };

  return (
    <div
      // ⚠️ **ブロックの地は塗らない（透明のまま）**（§4・production-manual.md §6-6
      // 「地は白」「ベタ塗りの面を置かない」）。既定サイズ 180×90mm は A4横のおよそ
      // 1/4を占めるので、ここに `bg-background`（#f7f8fa）を敷くとその面ぜんぶが
      // 灰色で刷られる。しかも `inkEstimate` は `block.style` の背景しか数えないので、
      // インクの目安にも出てこない。白いのはチーム（`bg-card`）だけでよい
      className="flex h-full w-full flex-col overflow-auto"
      // 入力欄・ボタンの上のクリックだけ止める（触ると focus が奪われる）。チームどうしの
      // 隙間・階層の見出し行の余白など「地」の上のクリックは止めない——止めると選択済みの
      // 体制図をつかんで動かす手段が無くなる（枠は pointer-events-none で掴めないため。
      // レビュー指摘）。**未選択のときは止めない** — 止めると選べなくなる
      onPointerDown={(e) => { if (selected && isInteractiveClickTarget(e.target)) e.stopPropagation(); }}
      // ＋/− を押した直後はフォーカスがそのボタンに残る。キャンバスの Delete / Backspace と
      // **矢印キーの移動**は入力欄（INPUT / TEXTAREA / contentEditable）しか避けない
      // （`manualCanvasGeometry.ts` の `isEditableTarget`）ので、そのまま押すと
      // ブロックごと消える・黙ってずれる。体制図はボタンの数が桁違いに多いので、ここで止める
      onKeyDown={(e) => {
        if (!selected) return;
        const onButton = (e.target as HTMLElement).tagName === "BUTTON";
        const stealsKey = e.key === "Backspace" || e.key === "Delete" || e.key.startsWith("Arrow");
        if (onButton && stealsKey) e.stopPropagation();
      }}
    >
      {tiers.map((tier, i) => {
        const boxes = tier.boxes ?? [];
        const count = boxes.reduce((n, b) => n + (b.people?.length ?? 0), 0);
        // この階層の行に**独立して**並ぶ箱だけ（親を持つ箱はその親の下に木として描かれる。
        // §本文の「木構造の分岐」）。`boxes` 自体（＝この階層のデータ全体）は
        // ＋チーム・人数カウントに引き続き使う
        const rootBoxes = boxes.filter(isRootBox);
        return (
          <div key={tier.id}>
            {/* 階層のあいだのつながり。上下の関係だけを示す細い縦罫（切ることもできる）。
                ⚠️ **色は `fg-disabled`（#9aa1ab）。`border`（#e6e9ed）では白地に刷ると消える**
                （§4「階層のつながりは縦の細罫 0.25mm」・§6-6「白黒で読めること」。
                モックも `background: #9aa1ab`）。**読ませる文字ではなく罫**なので、
                `fg-disabled` を使ってよい数少ない場所（`tailwind.preset.ts` の注記） */}
            {i > 0 && (
              connectors
                ? <div className="mx-auto h-4 w-px bg-fg-disabled" aria-hidden="true" />
                : <div className="h-2" aria-hidden="true" />
            )}

            <div className="mb-1 flex items-center gap-1.5">
              <div className={selected ? "w-24 shrink-0" : "min-w-0 max-w-[45%]"}>
                {selected ? (
                  <BufferedInput
                    value={tier.label}
                    onCommit={(v) => patchTier(tier.id, (t) => ({ ...t, label: v }))}
                    placeholder="階層の名前"
                    className={cn(ORG_INPUT, "w-full text-[10.5px] font-extrabold")}
                  />
                ) : (
                  <span className="block truncate text-[10.5px] font-extrabold">{tier.label}</span>
                )}
              </div>
              {/* 人数は**選択中だけ**。紙に出すとは §4 が決めていない追加なので、
                  刷ったものに勝手に足さない。単位は右パネルと同じ「人」にそろえる */}
              {selected && count > 0 && (
                <span className="shrink-0 text-[9.5px] text-muted-foreground">{count}人</span>
              )}
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
              {selected && (
                <>
                  <button
                    type="button"
                    onClick={() => setBoxes(tier.id, [...boxes, { id: genId("box"), label: "", people: [] }])}
                    className={ORG_PLUS}
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" />チーム
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (tiers.length > 1) setTiers(tiers.filter((t) => t.id !== tier.id)); }}
                    disabled={tiers.length <= 1}
                    title="この階層を削除"
                    className={ORG_MINUS}
                  >
                    <Minus className="h-3 w-3" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>

            {boxes.length === 0 ? (
              /* 置いた直後（§10-1）は階層が1つあるだけなので、既定の 180×90mm が
                 まるごと空欄に見える。**選択中だけ**破線の手がかりを出す（モックと同じ文言）。
                 紙には出さない — 出すと「塗らない・線だけ」の紙に、中身の無い枠が残る */
              selected && (
                <div className="rounded-badge-xs border border-dashed border-border px-1.5 py-0.5 text-[9px] text-muted-foreground">
                  まだチームがありません
                </div>
              )
            ) : (
              // rootBoxes が0件（この階層の箱が全部どこかの親にぶら下がっている）ときは
              // ここには何も描かない——箱そのものは親の下に木として出ている
              rootBoxes.length > 0 && (
                <div className="flex items-start gap-1.5">
                  {rootBoxes.map((box) => (
                    <OrgChartBoxTree
                      key={box.id}
                      box={box}
                      allBoxes={allBoxes}
                      show={show}
                      connectors={connectors}
                      selected={selected}
                      onChange={updateBox}
                      onRemove={removeBox}
                      parentOptionsOf={parentOptionsOf}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        );
      })}

      {selected && (
        <button
          type="button"
          onClick={() => setTiers([...tiers, { id: genId("tier"), label: "", boxes: [] }])}
          className={cn(ORG_PLUS, "mt-1 self-start")}
        >
          <Plus className="h-3 w-3" aria-hidden="true" />階層
        </button>
      )}
    </div>
  );
}
