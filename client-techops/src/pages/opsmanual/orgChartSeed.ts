// 体制図ブロックの「取り込み」— サーバーが返した候補（`GET /techops/manuals/:id/org-seed`）を
// いまの中身に流し込む純粋関数（production-manual-orgchart.md §5-4）。
//
// ⚠️ **1回かぎりの流し込み。** 取り込んだあとはマニュアル側の独立したデータで、元（案件の
// メンバー・プロジェクト管理の体制）を直してもここは追わない。だから元の id は持ち込まず、
// 階層・チーム・人の id はここで `genId('tier'|'box'|'psn')` を振る。
//
// ⚠️ **必ず作り直す（map / filter / スプレッド）。** `useManualHistory` は過去の blocks を
// スナップショットとして持っているので、元の配列を書き換えると undo が壊れる。
//
// ⚠️ **1人も足さなかったときは `content` を元の参照のまま返す。** 呼び出し側はそれを
// commit しないので、中身の変わらない undo の1手・自動保存1回が積まれない。
// 「入れる階層が無い」と「足す人がいない」は知らせ方が変わるので `status` で分ける。
//
// ⚠️ **キャンバスに出していない項目は持ち込まない**（`show`）。切れている項目は
// `OrgChartTeamBox` が入力欄すら出さないので、持ち込むと押した人に見えないまま保存される。
// ⚠️ 相対パスで入れる（`@/` の別名では入れない）。この関数は shared/tests から越境して試験されるが、
// vitest は client-techops の別名を解決できない（`manualPreExportChecks.ts` の `@/` は type だけなので通っている）
import { genId } from "../../lib/stableIds";
import type {
  ManualOrgBox,
  ManualOrgChartContent,
  ManualOrgPerson,
  ManualOrgTier,
} from "@gmo-onair/shared/src/opsmanual/types";
import type { ManualOrgSeedBox, ManualOrgSeedPerson, ManualOrgSeedTier } from "@/lib/manualApi";
import type { OrgChartShow } from "./blocks/orgchart/orgChartUi";

/**
 * 取り込みの結果。
 *
 * - `added`   … 1人以上（または1チーム以上）足した。`content` は作り直した新しい中身
 * - `no-tier` … 入れる階層が1つも無い（「案件のメンバーから」だけ起きる）。`content` は元のまま
 * - `none`    … 足すものが無かった（同じ名前の人ばかり・取り込み元が空）。`content` は元のまま
 */
export type OrgSeedStatus = "added" | "no-tier" | "none";

export interface OrgSeedMergeResult {
  content: ManualOrgChartContent;
  status: OrgSeedStatus;
}

/** 同じ名前の人は足さない（§5-4）。見比べる前に前後の空白だけ落とす */
function nameKey(name: string): string {
  return name.trim();
}

/**
 * いまの中身に居る人の名前を**階層をまたいで**集める。右パネルが「同じ名前の人は足しません。」と
 * 無条件に書いているので、入れる階層を切り替えて押しても同じ人が二度入らないようにする。
 */
function contentNames(content: ManualOrgChartContent): Set<string> {
  const set = new Set<string>();
  for (const tier of content.tiers ?? []) {
    for (const box of tier.boxes ?? []) {
      for (const p of box.people ?? []) {
        const key = nameKey(p.name);
        if (key) set.add(key);
      }
    }
  }
  return set;
}

/**
 * 候補1人 → 体制図の人。無い項目はキーごと持たない（サーバーも空は省いて返す）。
 *
 * ⚠️ **電話・メールは「出す項目」が入っているときだけ持ち込む。** 既定はどちらも切りで、
 * 切れている項目は `OrgChartTeamBox` が入力欄も出さない ＝ 持ち込むと、押した人が
 * 入れた自覚も見る手立ても消す手立ても無いまま、個人の連絡先がマニュアルの JSONB に入り
 * `GET /manuals/:id` を読める人全員に渡る。要るときは右パネルで電話・メールを入れてから押す。
 * 役割・所属は連絡先ではなく §5-4 の差し込み元の表そのものなので、切っていても持ち込む
 * （あとから「所属」を入れれば出る）。
 */
function toPerson(seed: ManualOrgSeedPerson, show: OrgChartShow): ManualOrgPerson {
  const person: ManualOrgPerson = { id: genId("psn"), name: seed.name };
  if (seed.role) person.role = seed.role;
  if (seed.org) person.org = seed.org;
  if (show.phone && seed.phone) person.phone = seed.phone;
  if (show.email && seed.email) person.email = seed.email;
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
  show: OrgChartShow,
): OrgSeedMergeResult {
  const tiers = content.tiers ?? [];
  // 「入れる階層が無い」と「足す人がいない」は別の知らせ方をするので混ぜない
  if (tiers.length === 0) return { content, status: "no-tier" };
  if (seed.length === 0) return { content, status: "none" };
  const target = tiers.find((t) => t.id === targetTierId) ?? tiers[0];
  const known = contentNames(content);

  const added: ManualOrgPerson[] = [];
  for (const s of seed) {
    const key = nameKey(s.name);
    if (!key || known.has(key)) continue;
    known.add(key);
    added.push(toPerson(s, show));
  }
  if (added.length === 0) return { content, status: "none" };

  const boxes = target.boxes ?? [];
  const nextBoxes: ManualOrgBox[] = boxes.length
    ? boxes.map((b, i) => (i === 0 ? { ...b, people: [...(b.people ?? []), ...added] } : b))
    : [{ id: genId("box"), label: "", people: added }];

  return {
    content: { ...content, tiers: tiers.map((t) => (t.id === target.id ? { ...t, boxes: nextBoxes } : t)) },
    status: "added",
  };
}

/**
 * 1階層ぶんの流し込み。`added` は足した人とチームの数で、**0 なら `tier` は元の参照のまま**
 * （呼び出し側が「何も足していない」を見分けられるようにする）。
 */
function mergeBoxes(
  tier: ManualOrgTier,
  seedBoxes: ManualOrgSeedBox[],
  known: Set<string>,
  show: OrgChartShow,
): { tier: ManualOrgTier; added: number } {
  let boxes = tier.boxes ?? [];
  let added = 0;
  for (const sb of seedBoxes) {
    const people: ManualOrgPerson[] = [];
    for (const sp of sb.people) {
      const key = nameKey(sp.name);
      if (!key || known.has(key)) continue;
      known.add(key);
      people.push(toPerson(sp, show));
    }
    const label = sb.label.trim();
    // 同じ名前のチームがすでにあれば、そこへ足す（取り込みを2回押しても増えない）
    const at = label ? boxes.findIndex((b) => b.label.trim() === label) : -1;
    if (at >= 0) {
      if (people.length === 0) continue;
      boxes = boxes.map((b, i) => {
        if (i !== at) return b;
        const merged: ManualOrgBox = { ...b, people: [...(b.people ?? []), ...people] };
        // 取り込み元の所属（`gpm_members.side` を日本語にしたもの）は、**空のときだけ**入れる。
        // 入れないと、同じ名前のチームへ足したときだけ所属が落ちて紙から消える（レビュー指摘）。
        // すでに手で入っている所属は上書きしない（利用者が書いたものが勝つ）
        if (!merged.org?.trim() && sb.org) merged.org = sb.org;
        return merged;
      });
      added += people.length;
      continue;
    }
    const box: ManualOrgBox = { id: genId("box"), label: sb.label, people };
    if (sb.org) box.org = sb.org;
    boxes = [...boxes, box];
    added += people.length + 1; // チームそのものも「足した」に数える（人の居ないチームも出せる・§3-1）
  }
  return added === 0 ? { tier, added } : { tier: { ...tier, boxes }, added };
}

/**
 * 「プロジェクト管理の体制から」（`gpm_members`）。候補が階層ごと（決裁層／推進層／実務層）
 * 組み上がって返るので、**階層の名前で突き合わせて**足す。同じ名前の階層が無ければ末尾に足す。
 * 置いた直後の空の階層（名前もチームも無い）は、そこに何も入らないので取り除く。
 */
export function mergeGpmTiers(
  content: ManualOrgChartContent,
  seed: ManualOrgSeedTier[],
  show: OrgChartShow,
): OrgSeedMergeResult {
  if (seed.length === 0) return { content, status: "none" };
  let tiers: ManualOrgTier[] = isUntouched(content) ? [] : content.tiers ?? [];
  const known = contentNames(content); // 階層をまたいで重複を見る（§5-4「同じ名前の人は足さない」）
  let added = 0;

  for (const st of seed) {
    const label = st.label.trim();
    const at = label ? tiers.findIndex((t) => t.label.trim() === label) : -1;
    if (at >= 0) {
      const merged = mergeBoxes(tiers[at], st.boxes, known, show);
      if (merged.added === 0) continue;
      tiers = tiers.map((t, i) => (i === at ? merged.tier : t));
      added += merged.added;
      continue;
    }
    const empty: ManualOrgTier = { id: genId("tier"), label: st.label, boxes: [] };
    const merged = mergeBoxes(empty, st.boxes, known, show);
    if (merged.added === 0) continue; // チームが1つも無い階層は作らない（空の階層を増やさない）
    tiers = [...tiers, merged.tier];
    added += merged.added;
  }

  // 1人・1チームも足さなかったら元の参照をそのまま返す（中身の変わらない1手を積まない）
  if (added === 0) return { content, status: "none" };
  return { content: { ...content, tiers }, status: "added" };
}

/** 取り込みボタンの脇に出す件数（人数）。`gpm` は階層をまたいだ合計 */
export function countSeedPeople(seed: ManualOrgSeedTier[]): number {
  return seed.reduce((n, t) => n + t.boxes.reduce((m, b) => m + b.people.length, 0), 0);
}
