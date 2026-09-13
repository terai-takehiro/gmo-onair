// 「差し込む」カタログ（段C・production-manual.md §4-3・§6③）。
//
// ミニアプリごとに束ねて出し（`manualLinkedBlocksByGroup()`）、このマニュアルに実在する種別だけを
// 押せるようにする（`getLinkCatalog`。押すと空になる項目を作らない＝§4-3）。
// `sourceId` が要る種別（進行台本の3種）は、資料が2件以上あるときだけ選ばせる
// （1件なら選ばせずそのまま置く）。置いたあとの設定（出す項目・秘密の解除）は
// `LinkedBlockInspector.tsx` の役目 — ここは「置く」ところまで。
//
// ⚠️ 常設パネル（モーダルではない）。`BlockToolbar.tsx`（自由ブロックの「＋」）と並べて置く。
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { notifyError } from "@/lib/notify";
import {
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  type ManualBlock,
  type ManualLinkedBlock,
} from "@gmo-onair/shared/src/opsmanual/types";
import {
  manualLinkedBlocksByGroup,
  type ManualLinkedBlockDef,
  type ManualLinkedBlockKey,
} from "@gmo-onair/shared/src/production/manualBlocks";
import { genBlockId } from "./manualCanvasGeometry";
import { getLinkCatalog, getLinkSources, type ManualLinkSource } from "@/lib/manualResolveApi";

function nextZ(blocks: ManualBlock[]): number {
  return blocks.reduce((max, b) => Math.max(max, b.z), 0) + 1;
}

/** キャンバスの中央に置いたときの x/y（mm・左上原点） */
function centered(w: number, h: number): { x: number; y: number } {
  return { x: Math.max(0, (PAGE_WIDTH_MM - w) / 2), y: Math.max(0, (PAGE_HEIGHT_MM - h) / 2) };
}

function buildLinkedBlock(def: ManualLinkedBlockDef, sourceId: string | null, z: number): ManualLinkedBlock {
  const { w, h } = def.defaultSize;
  return {
    id: genBlockId(),
    kind: "linked",
    ...centered(w, h),
    w,
    h,
    z,
    style: {},
    link: { block: def.key, sourceId, options: {}, frozen: null },
  };
}

interface SourcePicker {
  key: ManualLinkedBlockKey;
  def: ManualLinkedBlockDef;
  sources: ManualLinkSource[];
}

interface Props {
  manualId: string;
  blocks: ManualBlock[];
  onAdd: (block: ManualBlock) => void;
  /** このマニュアルが番組（`qsheet_programs`）に紐づくか（true）・案件に紐づくか（false/未指定）。
   *  資料が無いときの案内文の呼び分けにだけ使う（`ManualListPage.tsx` 等と同じ呼び分け） */
  isProgram?: boolean;
}

export default function InsertPanel({ manualId, blocks, onAdd, isProgram = false }: Props) {
  const [sourcePicker, setSourcePicker] = useState<SourcePicker | null>(null);
  const [loadingKey, setLoadingKey] = useState<ManualLinkedBlockKey | null>(null);

  const catalogQuery = useQuery({
    queryKey: ["manuals", manualId, "link-catalog"],
    queryFn: () => getLinkCatalog(manualId),
    enabled: !!manualId,
  });
  const available = new Set(catalogQuery.data ?? []);

  const addBlock = (def: ManualLinkedBlockDef, sourceId: string | null) => {
    onAdd(buildLinkedBlock(def, sourceId, nextZ(blocks)));
    setSourcePicker(null);
  };

  const handleCardClick = async (def: ManualLinkedBlockDef) => {
    if (!available.has(def.key)) return;
    if (sourcePicker?.key === def.key) {
      setSourcePicker(null); // もう一度押したら閉じる
      return;
    }
    setLoadingKey(def.key);
    try {
      // `sourceId` が要らない種別（`sourceGroup !== 'sheet'`）はサーバーが常に空配列を
      // 返す契約（§5-4）——その場合は 0件のまま `sourceId: null` で置いてよい。
      const sources = await getLinkSources(manualId, def.key);
      const requiresSource = def.sourceGroup === "sheet";
      // ⚠️ レビュー指摘（P2）: 進行台本の3種（`sourceId` が要る）で候補が0件のときだけ、
      // 「1件も無いのでそのまま置く」を誤って適用していた——資料が本当に無い場合と
      // 「案件には資料があるが本人が読めるものが1つも無い（`listSheetSources` の ACL
      // フィルタ・レビュー指摘）」場合の両方がありうる。どちらにせよ `sourceId: null` の
      // まま置くと resolver は常に `source_id_required` を返し、二度と直せない壊れた
      // ブロックがキャンバスに残ってしまう。この3種だけ、0件は「置かずに知らせる」、
      // 1件のときだけ自動で置く、2件以上のときだけ選ばせる、の3分岐にする。
      if (requiresSource && sources.length === 0) {
        notifyError("差し込める資料がありません。", { description: "自分が読める進行台本がまだ無いか、共有されていません。" });
        return;
      }
      if (sources.length <= 1) {
        addBlock(def, sources[0]?.id ?? null);
      } else {
        setSourcePicker({ key: def.key, def, sources });
      }
    } catch {
      notifyError("差し込む資料を確認できませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-3">
      <span className="text-sub-sm font-medium text-foreground">差し込む</span>

      {catalogQuery.isLoading && <p className="text-sub-sm text-muted-foreground">確認中…</p>}
      {catalogQuery.isError && <p className="text-sub-sm text-destructive">一覧を読み込めませんでした。</p>}

      <div className="flex flex-col gap-3">
        {manualLinkedBlocksByGroup().map((group) => (
          <div key={group.group} className="flex flex-col gap-1.5">
            <span className="text-sub-sm text-muted-foreground">{group.label}</span>
            <div className="flex flex-col gap-1.5">
              {group.blocks.map((def) => (
                <InsertCard
                  key={def.key}
                  def={def}
                  available={available.has(def.key)}
                  loading={loadingKey === def.key}
                  open={sourcePicker?.key === def.key}
                  onClick={() => handleCardClick(def)}
                  sources={sourcePicker?.key === def.key ? sourcePicker.sources : null}
                  onPickSource={(id) => addBlock(def, id)}
                  isProgram={isProgram}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface InsertCardProps {
  def: ManualLinkedBlockDef;
  available: boolean;
  loading: boolean;
  open: boolean;
  onClick: () => void;
  sources: ManualLinkSource[] | null;
  onPickSource: (id: string) => void;
  isProgram: boolean;
}

function InsertCard({ def, available, loading, open, onClick, sources, onPickSource, isProgram }: InsertCardProps) {
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={!available || loading}
        onClick={onClick}
        className={cn(
          "flex min-h-tap flex-col items-start gap-0.5 rounded-control border px-2.5 py-2 text-left transition-colors",
          available
            ? "border-border bg-background hover:border-primary hover:bg-primary-surface-weak"
            : "cursor-not-allowed border-dashed border-border/60 bg-muted/20 opacity-60",
        )}
      >
        <span className="flex w-full items-center gap-1.5 text-sub font-medium text-foreground">
          {def.label}
          {def.hasSecrets && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />}
          {loading && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />}
        </span>
        <span className="text-sub-sm text-muted-foreground">
          {available ? def.description : isProgram ? "この番組に資料がありません" : "この案件に資料がありません"}
        </span>
      </button>

      {open && sources && (
        <div className="ml-2 flex flex-col gap-0.5 border-l border-border pl-2">
          {sources.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onPickSource(s.id)}
              className="min-h-tap rounded-control px-2 py-1 text-left text-sub-sm text-foreground hover:bg-accent"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
