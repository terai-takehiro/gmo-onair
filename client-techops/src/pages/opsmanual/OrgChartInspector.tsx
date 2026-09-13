// 運営マニュアル — 体制図ブロック（free.type: 'orgchart'）の右パネル
// （docs/design/v4/production-manual-orgchart.md §5-3）。
//
// 持つのは4区画だけ:
//   ① 階層     — 追加・名前・上下の入れ替え・削除（最後の1階層は消せない）
//   ② 出す項目 — 役割 / 所属 / 電話 / メール（既定は役割だけ）
//   ③ 線       — 階層のつながりの縦罫（入／切）
//   ④ 取り込み — 「案件のメンバーから」「プロジェクト管理の体制から」
//
// ⚠️ 立場（自社・発注者・PM会社・業者）の凡例は**置かない**。区分そのものを持たず、
// 所属は自由入力の文字だけ・枠線はどのチームも同じ（§10-2・2026-09-13 の利用者の判断）。
//
// チーム・人そのものの追加削除と、階層／チーム／人の名前をその場で打つのは
// **キャンバスの上**（`blocks/OrgChartBlockContent.tsx`・§5-2「ダイアログは出さない」）。
// ここが触るのは「階層の組み替え」と「紙にどこまで出すか」だけ。
//
// 置かれ方: `BlockInspector.tsx` の自由ブロックのカード（`rounded-card border bg-card p-3`）の
// **中**に差し込まれる前提なので、自分ではカードを持たない（複製・削除のボタンもあちらが出す）。
// `onCommit` は最終的に `ManualCanvas` の `useManualHistory.commit` に届くので、
// **ここでの1操作 = undo の1手 = 自動保存1回ぶん**。だから文字欄は素の `onChange` ではなく
// `BufferedInput`（確定・blur で1回だけ出す。IME も壊さない）を使う。
import { useState } from "react";
import { ArrowDown, ArrowUp, Download, Plus, Trash2 } from "lucide-react";
import { Checkbox } from "@gmo-onair/shared/src/client/ui/checkbox";
import { Switch } from "@gmo-onair/shared/src/client/ui/switch";
import { Button } from "@/components/ui/button";
import BufferedInput from "@/components/editor/BufferedInput";
import { genId } from "@/lib/stableIds";
import { cn } from "@/lib/utils";
import type { ManualOrgChartContent, ManualOrgTier } from "@gmo-onair/shared/src/opsmanual/types";
import { resolveOrgChartShow, type OrgChartShow } from "./blocks/orgchart/orgChartUi";

/** 取り込み元（§5-4）。`project` = 案件のメンバー ／ `gpm` = 同じ案件のプロジェクト管理の体制 */
export type ManualOrgSeedKind = "project" | "gpm";

/** 取り込み元に何件あるか。`null` = まだ数えていない（ボタンは押せるままにする） */
export interface ManualOrgSeedCounts {
  project: number | null;
  gpm: number | null;
}

/**
 * 「紙に出す項目」の既定値（§5-3「既定は役割だけ」）。
 * **既定はキャンバス側（`blocks/orgchart/orgChartUi.ts` の `resolveOrgChartShow`）が唯一の正**で、
 * ここはそれを呼ぶだけ——既定を2か所に書くと右パネルの印と紙に出る絵が食い違う。
 */
export function manualOrgShowFlags(content: ManualOrgChartContent): OrgChartShow {
  return resolveOrgChartShow(content);
}

type ShowKey = keyof ReturnType<typeof manualOrgShowFlags>;

const SHOW_FIELDS: { key: ShowKey; label: string }[] = [
  { key: "role", label: "役割" },
  { key: "org", label: "所属" },
  { key: "phone", label: "電話" },
  { key: "email", label: "メール" },
];

// `BlockInspector.tsx` / `LinkedBlockInspector.tsx` と同じ見た目の作法（あえて複製する —
// どちらも別の担当が触るファイルなので、export を増やして結び付けない）
const FIELD_LABEL = "flex items-center justify-between gap-2 text-sub-sm text-muted-foreground";
const SECTION_TITLE = "text-sub-sm font-bold text-foreground";
const SECTION = "flex flex-col gap-2 border-t border-border pt-3";
const TEXT_INPUT = "min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-sub-sm text-foreground";

/**
 * 中身が空・壊れているときの受け皿。**キャンバス（`blocks/OrgChartBlockContent.tsx`）と同じ形**にする。
 * ブロックの中身は検証なしの JSONB（`manual.service.ts` の `updatePage`）なので、`tiers` が無い・
 * `boxes` が無い中身が実際に届きうる。ここだけ素で読むと、**同じ中身でキャンバスは描けて
 * 右パネルだけ白くなる**切れ方をする。あちらは別の担当が触るファイルなので export で結び付けず、
 * 同じ形をここにも置く（すぐ上の見た目の定数と同じ理由）。
 */
const FALLBACK_TIERS: ManualOrgTier[] = [{ id: "tier_1", label: "", boxes: [] }];

interface Props {
  /** 選択中の体制図ブロックの中身（`block.free.content`） */
  content: ManualOrgChartContent;
  /** 中身を丸ごと差し替える（`BlockInspector` の `patchContent` をそのまま渡す） */
  onCommit: (content: ManualOrgChartContent) => void;
  /**
   * 取り込みボタンを押したとき。**実処理（`GET /techops/manuals/:id/org-seed` を呼んで
   * 中身へ流し込む）は呼び出し側が持つ** — ここは押されたことを伝えるだけ。
   * `targetTierId` は「案件のメンバーから」の流し込み先（§5-4「流し込み先はいま選んでいる階層」）。
   * 「プロジェクト管理の体制から」は `tier` ごと入るので呼び出し側は無視してよい。
   * 渡さないと取り込みの区画ごと出ない（読み取り専用の閲覧など）。
   */
  onSeed?: (kind: ManualOrgSeedKind, targetTierId: string | null) => void;
  /**
   * 取り込み元の件数。`0` のボタンは押せなくする（§4-3「押すと空になる項目を作らない」）。
   * 両方 `0` なら取り込みの区画ごと出さない（番組のマニュアルは案件が無いので両方 `0`・§5-5）。
   * 省略 = まだ数えていない（ボタンは押せるまま）。
   */
  seedCounts?: ManualOrgSeedCounts;
  /** 取り込みの通信中。そのボタンだけ塞ぐ */
  seeding?: ManualOrgSeedKind | null;
}

export default function OrgChartInspector({ content, onCommit, onSeed, seedCounts, seeding }: Props) {
  const tiers = content.tiers?.length ? content.tiers : FALLBACK_TIERS;
  const [pickedTierId, setPickedTierId] = useState<string | null>(null);
  // 消された階層を指したままにならないよう、毎回いまの配列で確かめ直す
  const targetTierId = tiers.some((t) => t.id === pickedTierId) ? pickedTierId : tiers[0]?.id ?? null;
  const show = manualOrgShowFlags(content);
  const connectors = content.connectors ?? true;

  const patchTiers = (next: ManualOrgTier[]) => onCommit({ ...content, tiers: next });
  const setShow = (key: ShowKey, value: boolean) => {
    const next = { ...show };
    next[key] = value;
    onCommit({ ...content, show: next });
  };

  const addTier = () => {
    const tier: ManualOrgTier = { id: genId("tier"), label: "", boxes: [] };
    patchTiers([...tiers, tier]);
    setPickedTierId(tier.id);
  };
  const renameTier = (id: string, label: string) => {
    patchTiers(tiers.map((t) => (t.id === id ? { ...t, label } : t)));
  };
  const moveTier = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= tiers.length) return;
    const next = [...tiers];
    const [moved] = next.splice(index, 1);
    next.splice(to, 0, moved);
    patchTiers(next);
  };
  const removeTier = (id: string) => {
    if (tiers.length <= 1) return; // 最後の1階層は消せない（§5-3）
    patchTiers(tiers.filter((t) => t.id !== id));
  };

  return (
    <div className="flex flex-col gap-3">
      {/* ① 階層 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className={SECTION_TITLE}>階層</span>
          <Button type="button" variant="outline" size="sm" onClick={addTier}>
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            階層を足す
          </Button>
        </div>
        {tiers.map((tier, i) => (
          <TierRow
            key={tier.id}
            tier={tier}
            no={i + 1}
            first={i === 0}
            last={i === tiers.length - 1}
            only={tiers.length <= 1}
            onRename={(v) => renameTier(tier.id, v)}
            onMove={(d) => moveTier(i, d)}
            onRemove={() => removeTier(tier.id)}
          />
        ))}
      </div>

      {/* ② 紙に出す項目 */}
      <div className={SECTION}>
        <span className={SECTION_TITLE}>紙に出す項目</span>
        {/* チェックは共通部品（20px）。20px 単体は指に小さいので、行そのものを 44px の当たりにして
            ラベルの文字ごと押せるようにする（ルート CLAUDE.md「タップ領域は最低 44px」） */}
        {SHOW_FIELDS.map((f) => (
          <label key={f.key} className={cn(FIELD_LABEL, "min-h-tap cursor-pointer py-1")}>
            {f.label}
            <Checkbox checked={show[f.key]} onCheckedChange={(v) => setShow(f.key, v === true)} />
          </label>
        ))}
        <p className="text-sub-sm text-muted-foreground">
          名前は必ず出ます。増やすほど枠が詰まるので、紙に要るものだけを選んでください。
        </p>
      </div>

      {/* ③ 階層のつながりの線 */}
      <div className={SECTION}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className={SECTION_TITLE}>階層のつながりの線</span>
            <span className="text-sub-sm text-muted-foreground">
              上下のつながりだけを細い縦罫で示します（横の並びは「同じ階層にある」ことで表します）。
            </span>
          </div>
          <Switch
            checked={connectors}
            onCheckedChange={(v) => onCommit({ ...content, connectors: v })}
            aria-label="階層のつながりの線"
            className="mt-0.5 shrink-0"
          />
        </div>
      </div>

      {/* ④ 取り込み */}
      <SeedSection
        tiers={tiers}
        targetTierId={targetTierId}
        onPickTier={setPickedTierId}
        onSeed={onSeed}
        seedCounts={seedCounts}
        seeding={seeding ?? null}
      />
    </div>
  );
}

function TierRow({
  tier,
  no,
  first,
  last,
  only,
  onRename,
  onMove,
  onRemove,
}: {
  tier: ManualOrgTier;
  no: number;
  first: boolean;
  last: boolean;
  only: boolean;
  onRename: (v: string) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  // `boxes` / `people` も検証なしの JSONB（FALLBACK_TIERS のコメント）。素で読むと右パネルだけ落ちる
  const people = tier.boxes?.reduce((n, b) => n + (b.people?.length ?? 0), 0) ?? 0;
  return (
    <div className="flex items-center gap-1 rounded-control border border-border bg-background px-2 py-1">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-badge-xs bg-muted text-sub-sm text-muted-foreground">
        {no}
      </span>
      {/* 階層の名前は日本語を打つ欄なので BufferedInput（素の controlled input は IME が壊れる） */}
      <BufferedInput value={tier.label} onCommit={onRename} placeholder="階層の名前" className={TEXT_INPUT} />
      <span className="shrink-0 text-sub-sm text-muted-foreground">{people}人</span>
      <Button type="button" variant="ghost" size="icon-sm" onClick={() => onMove(-1)} disabled={first} aria-label="上へ" title="上へ">
        <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" onClick={() => onMove(1)} disabled={last} aria-label="下へ" title="下へ">
        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        disabled={only}
        aria-label="この階層を削除"
        title={only ? "最後の1階層は消せません" : "この階層を削除"}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}

function SeedSection({
  tiers,
  targetTierId,
  onPickTier,
  onSeed,
  seedCounts,
  seeding,
}: {
  tiers: ManualOrgTier[];
  targetTierId: string | null;
  onPickTier: (id: string) => void;
  onSeed?: (kind: ManualOrgSeedKind, targetTierId: string | null) => void;
  seedCounts?: ManualOrgSeedCounts;
  seeding: ManualOrgSeedKind | null;
}) {
  if (!onSeed) return null;
  const seed = onSeed; // クロージャの中でも undefined でないことを保つ
  // 番組のマニュアルは案件が無いので両方 0 で返る ＝ ボタンを出さない（§5-5）
  // `null`（まだ数えていない）は「無し」と混同しない — 0 と分かっているときだけ畳む
  if (seedCounts && seedCounts.project === 0 && seedCounts.gpm === 0) {
    return (
      <div className={SECTION}>
        <span className={SECTION_TITLE}>取り込む</span>
        <p className="text-sub-sm text-muted-foreground">このマニュアルから取り込める体制はありません。</p>
      </div>
    );
  }

  return (
    <div className={SECTION}>
      <span className={SECTION_TITLE}>取り込む（1回かぎり）</span>
      {tiers.length > 1 && (
        <label className={FIELD_LABEL}>
          入れる階層
          <select
            value={targetTierId ?? ""}
            onChange={(e) => onPickTier(e.target.value)}
            className="w-28 rounded border border-input bg-background px-2 py-1 text-sub-sm text-foreground"
          >
            {tiers.map((t, i) => (
              <option key={t.id} value={t.id}>
                {t.label || `${i + 1}つめの階層`}
              </option>
            ))}
          </select>
        </label>
      )}
      <SeedButton
        label="案件のメンバーから"
        count={seedCounts?.project}
        busy={seeding === "project"}
        onClick={() => seed("project", targetTierId)}
      />
      <SeedButton
        label="プロジェクト管理の体制から"
        count={seedCounts?.gpm}
        busy={seeding === "gpm"}
        onClick={() => seed("gpm", targetTierId)}
      />
      <p className="text-sub-sm text-muted-foreground">
        入れたあとはこのマニュアルのものです。元（案件のメンバー）を直してもここは変わりません。
        同じ名前の人は足しません。
      </p>
    </div>
  );
}

function SeedButton({
  label,
  count,
  busy,
  onClick,
}: {
  label: string;
  count: number | null | undefined;
  busy: boolean;
  onClick: () => void;
}) {
  const empty = count === 0;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("justify-start", empty && "text-muted-foreground")}
      disabled={empty || busy}
      onClick={onClick}
    >
      <Download className="mr-1.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <span className="ml-2 shrink-0 text-sub-sm text-muted-foreground">
        {busy ? "取り込み中" : empty ? "無し" : count == null ? "" : `${count}人`}
      </span>
    </Button>
  );
}
