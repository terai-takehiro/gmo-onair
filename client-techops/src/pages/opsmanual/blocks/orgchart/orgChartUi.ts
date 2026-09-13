// 体制図ブロックの中身で使い回す決めごと（production-manual-orgchart.md §3・§4）。
//
// **読み（紙に出る絵）と書き（選択中の入力欄）で同じ大きさ・同じ余白を使う。**
// ここがずれると、選んだ瞬間に行の高さが動いて「刷るとどう見えるか」が壊れる
// （表ブロックが読みと書きで `px-1 py-0.5 text-[10px]` を揃えているのと同じ理由）。
import type { ManualOrgBox, ManualOrgChartContent } from "@gmo-onair/shared/src/opsmanual/types";

/**
 * 人の行に出す項目。**既定は役割だけ**（§3・紙の密度を下げる）。
 *
 * 4つとも `ManualOrgPerson` の任意項目に1対1で対応する。
 * チームの見出しの所属（`ManualOrgBox.org`）はここでは切り替えない
 * — 立場の区分を持たない体制図では、どこの会社かを読む唯一の手がかりだから（§4・§10-2）。
 */
export interface OrgChartShow {
  role: boolean;
  org: boolean;
  phone: boolean;
  email: boolean;
  /** 顔写真。既定 false（インクを使うため・§6-6。role 等と違い「無いのが既定」） */
  photo: boolean;
}

export function resolveOrgChartShow(content: ManualOrgChartContent): OrgChartShow {
  const s = content.show;
  return {
    role: s?.role ?? true,
    org: s?.org ?? false,
    phone: s?.phone ?? false,
    email: s?.email ?? false,
    photo: s?.photo ?? false,
  };
}

/**
 * `boxId` の子孫（`parentId` を辿って下につながる箱）の id 集合。
 *
 * ⚠️ レビュー指摘（P1）: 階層の並べ替え（`OrgChartInspector.tsx` の「↑/↓」）は
 * `parentId` を書き換えないため、階層の順序を入れ替えると「元は子だった箱」が
 * 「元は親だった箱」より手前の階層になりうる——`parentOptionsOf`（手前の階層の箱を
 * 挙げるだけ）はこの逆転に気づかず、子を親の親として選べてしまう。選ぶと A↔B の
 * 循環ができ、`isRootBox` がどちらも「親あり」と判定するため**どちらもキャンバスから
 * 消える**（自動保存されるので気づきにくい）。親の候補からは**自分の子孫を必ず除く**。
 */
export function descendantBoxIds(boxId: string, allBoxes: Pick<ManualOrgBox, "id" | "parentId">[]): Set<string> {
  const result = new Set<string>();
  const queue: string[] = [boxId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const b of allBoxes) {
      if (b.parentId === current && !result.has(b.id)) {
        result.add(b.id);
        queue.push(b.id);
      }
    }
  }
  return result;
}

/** 選択中の入力欄。枠は出さず、当たっているところだけ薄く敷く（紙の絵を邪魔しない） */
export const ORG_INPUT = "min-w-0 bg-transparent outline-none focus-visible:bg-accent/40";

/** 行の「−」。表ブロックと同じ形・同じ当たり方にそろえる */
export const ORG_MINUS = "shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-30";

/** 「＋ …」。選択中だけ描くので紙には出ない */
export const ORG_PLUS = "inline-flex shrink-0 items-center gap-0.5 text-[9px] text-muted-foreground hover:text-foreground";
