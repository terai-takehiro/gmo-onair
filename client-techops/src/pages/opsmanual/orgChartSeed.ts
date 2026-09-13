// 体制図ブロックの「取り込み」— サーバーが返した候補（`GET /techops/manuals/:id/org-seed`）を
// いまの中身に流し込む純粋関数（production-manual-orgchart.md §5-4）。
//
// ⚠️ **1回かぎりの流し込み。** 取り込んだあとはマニュアル側の独立したデータで、元（案件の
// メンバー・プロジェクト管理の体制）を直してもここは追わない。だから元の id は持ち込まず、
// 階層・チーム・人の id はここで `genId('tier'|'box'|'psn')` を振る。
//
// ⚠️ **必ず作り直す（map / filter / スプレッド）。** `useManualHistory` は過去の blocks を
// スナップショットとして持っているので、元の配列を書き換えると undo が壊れる。
import { genId } from "@/lib/stableIds";
import type {
  ManualOrgBox,
  ManualOrgChartContent,
  ManualOrgPerson,
  ManualOrgTier,
} from "@gmo-onair/shared/src/opsmanual/types";
import type { ManualOrgSeedBox, ManualOrgSeedPerson, ManualOrgSeedTier } from "@/lib/manualApi";

/** 同じ名前の人は足さない（§5-4）。見比べる前に前後の空白だけ落とす */
function nameKey(name: string): string {
  return name.trim();
}

function tierNames(tier: ManualOrgTier): Set<string> {
  const set = new Set<string>();
  for (const box of tier.boxes ?? []) {
    for (const p of box.people ?? []) {
      const key = nameKey(p.name);
      if (key) set.add(key);
    }
  }
  return set;
}

/** 候補1人 → 体制図の人。無い項目はキーごと持たない（サーバーも空は省いて返す） */
function toPerson(seed: ManualOrgSeedPerson): ManualOrgPerson {
  const person: ManualOrgPerson = { id: genId("psn"), name: seed.name };
  if (seed.role) person.role = seed.role;
  if (seed.org) person.org = seed.org;
  if (seed.phone) person.phone = seed.phone;
  if (seed.email) person.email = seed.email;
  if (seed.badge) person.badge = seed.badge;
  return person;
}

/** 置いた直後のまま（名前の無い階層が1つ・チーム0）か。取り込みで空の階層を残さないための判定 */
function isUntouched(content: ManualOrgChartContent): boolean {
  const tiers = content.tiers ?? [];
  return tiers.length === 1 && !tiers[0].label.trim() && (tiers[0].boxes?.length ?? 0) === 0;
}

/**
 * 「案件のメンバーから」（`project_members`）。階層を持たない平らな候補なので、
 * **いま選んでいる階層**（`targetTierId`）の1つ目のチームに入れる（§5-4）。
 * チームが1つも無ければ名前の無いチームを1つ作る（チーム名は利用者があとで打つ）。
 */
export function mergeProjectMembers(
  content: ManualOrgChartContent,
  targetTierId: string | null,
  seed: ManualOrgSeedPerson[],
): ManualOrgChartContent {
  const tiers = content.tiers ?? [];
  if (tiers.length === 0 || seed.length === 0) return content;
  const target = tiers.find((t) => t.id === targetTierId) ?? tiers[0];
  const known = tierNames(target);

  const added: ManualOrgPerson[] = [];
  for (const s of seed) {
    const key = nameKey(s.name);
    if (!key || known.has(key)) continue;
    known.add(key);
    added.push(toPerson(s));
  }
  if (added.length === 0) return content;

  const boxes = target.boxes ?? [];
  const nextBoxes: ManualOrgBox[] = boxes.length
    ? boxes.map((b, i) => (i === 0 ? { ...b, people: [...(b.people ?? []), ...added] } : b))
    : [{ id: genId("box"), label: "", people: added }];

  return { ...content, tiers: tiers.map((t) => (t.id === target.id ? { ...t, boxes: nextBoxes } : t)) };
}

function mergeBoxes(tier: ManualOrgTier, seedBoxes: ManualOrgSeedBox[], known: Set<string>): ManualOrgTier {
  let boxes = tier.boxes ?? [];
  for (const sb of seedBoxes) {
    const people: ManualOrgPerson[] = [];
    for (const sp of sb.people) {
      const key = nameKey(sp.name);
      if (!key || known.has(key)) continue;
      known.add(key);
      people.push(toPerson(sp));
    }
    const label = sb.label.trim();
    // 同じ名前のチームがすでにあれば、そこへ足す（取り込みを2回押しても増えない）
    const at = label ? boxes.findIndex((b) => b.label.trim() === label) : -1;
    if (at >= 0) {
      if (people.length === 0) continue;
      boxes = boxes.map((b, i) => (i === at ? { ...b, people: [...(b.people ?? []), ...people] } : b));
      continue;
    }
    const box: ManualOrgBox = { id: genId("box"), label: sb.label, people };
    if (sb.org) box.org = sb.org;
    boxes = [...boxes, box];
  }
  return { ...tier, boxes };
}

/**
 * 「プロジェクト管理の体制から」（`gpm_members`）。候補が階層ごと（決裁層／推進層／実務層）
 * 組み上がって返るので、**階層の名前で突き合わせて**足す。同じ名前の階層が無ければ末尾に足す。
 * 置いた直後の空の階層（名前もチームも無い）は、そこに何も入らないので取り除く。
 */
export function mergeGpmTiers(
  content: ManualOrgChartContent,
  seed: ManualOrgSeedTier[],
): ManualOrgChartContent {
  if (seed.length === 0) return content;
  let tiers = isUntouched(content) ? [] : content.tiers ?? [];

  for (const st of seed) {
    const label = st.label.trim();
    const at = label ? tiers.findIndex((t) => t.label.trim() === label) : -1;
    if (at >= 0) {
      const merged = mergeBoxes(tiers[at], st.boxes, tierNames(tiers[at]));
      tiers = tiers.map((t, i) => (i === at ? merged : t));
      continue;
    }
    const empty: ManualOrgTier = { id: genId("tier"), label: st.label, boxes: [] };
    tiers = [...tiers, mergeBoxes(empty, st.boxes, new Set<string>())];
  }

  return { ...content, tiers };
}

/** 取り込みボタンの脇に出す件数（人数）。`gpm` は階層をまたいだ合計 */
export function countSeedPeople(seed: ManualOrgSeedTier[]): number {
  return seed.reduce((n, t) => n + t.boxes.reduce((m, b) => m + b.people.length, 0), 0);
}
